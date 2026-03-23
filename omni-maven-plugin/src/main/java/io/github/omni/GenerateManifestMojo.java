package io.github.omni;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thoughtworks.qdox.JavaProjectBuilder;
import com.thoughtworks.qdox.model.JavaClass;
import com.thoughtworks.qdox.model.JavaMethod;
import com.thoughtworks.qdox.model.JavaParameter;
import org.apache.maven.execution.MavenSession;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugins.annotations.Component;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;
import org.apache.maven.project.MavenProject;

import java.io.File;
import java.util.*;

// 确保在编译完成、打包之前执行，此时 target/classes 已就绪
@Mojo(name = "generate", defaultPhase = LifecyclePhase.PROCESS_CLASSES)
public class GenerateManifestMojo extends AbstractMojo {

    @Parameter(defaultValue = "${project}", readonly = true)
    private MavenProject project;

    @Parameter(defaultValue = "${session}", readonly = true)
    private MavenSession session;

    /**
     * 相对路径，例如 .omni/manifests
     * 会自动拼接在 session.getExecutionRootDirectory() 之后
     */
    @Parameter(property = "omni.globalOutputRelPath", defaultValue = ".omni/manifests")
    private String globalOutputRelPath;

    @Override
    public void execute() throws MojoExecutionException {
        getLog().info("OmniSense is scanning module: " + project.getArtifactId());

        try {
            JavaProjectBuilder builder = new JavaProjectBuilder();
            builder.setErrorHandler(e -> getLog().warn("Parsing error (skipped): " + e.getMessage()));

            List<String> sourceRoots = project.getCompileSourceRoots();
            if (sourceRoots == null || sourceRoots.isEmpty()) return;

            for (String root : sourceRoots) {
                File rootFile = new File(root);
                if (rootFile.exists()) builder.addSourceTree(rootFile);
            }

            // 1. 构造清单数据
            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("module", project.getArtifactId());
            manifest.put("version", project.getVersion());

            List<Map<String, String>> apis = new ArrayList<>();
            for (JavaClass cls : builder.getClasses()) {
                if (cls.isPublic() && !cls.isInner() && !cls.getName().endsWith("Test")) {
                    for (JavaMethod method : cls.getMethods()) {
                        if (method.isPublic()) {
                            Map<String, String> api = new LinkedHashMap<>();
                            api.put("class", cls.getFullyQualifiedName());
                            api.put("signature", buildSignature(method));
                            api.put("description", method.getComment() != null ? method.getComment().trim() : "");
                            apis.add(api);
                        }
                    }
                }
            }
            manifest.put("apis", apis);

            if (apis.isEmpty()) {
                getLog().info("No public APIs found. Skipping.");
                return;
            }

            ObjectMapper mapper = new ObjectMapper();

            // --- 核心逻辑 A: 写入 target/classes (确保打入 JAR) ---
            // Maven 打包时会自动包含 target/classes 下的所有内容
            File classesMetaInf = new File(project.getBuild().getOutputDirectory(), "META-INF");
            if (!classesMetaInf.exists()) classesMetaInf.mkdirs();
            File jarManifestFile = new File(classesMetaInf, "omni-manifest.json");
            mapper.writerWithDefaultPrettyPrinter().writeValue(jarManifestFile, manifest);
            getLog().info("Manifest embedded in JAR: " + jarManifestFile.getPath());

            // --- 核心逻辑 B: 写入工程根目录 (供 VS Code 插件消费) ---
            String rootDir = session.getExecutionRootDirectory();
            File globalDir = new File(rootDir, globalOutputRelPath);
            if (!globalDir.exists()) globalDir.mkdirs();

            // 使用 artifactId 命名，防止 19 个模块互相覆盖
            File globalFile = new File(globalDir, project.getArtifactId() + ".json");
            mapper.writerWithDefaultPrettyPrinter().writeValue(globalFile, manifest);
            getLog().info("Manifest synced to project root: " + globalFile.getPath());

        } catch (Exception e) {
            getLog().error("OmniSense sync failed: " + e.getMessage());
        }
    }

    private String buildSignature(JavaMethod method) {
        StringBuilder sb = new StringBuilder();
        if (method.getReturns() != null) {
            sb.append(method.getReturns().getGenericValue()).append(" ");
        }
        sb.append(method.getName()).append("(");
        List<JavaParameter> params = method.getParameters();
        for (int i = 0; i < params.size(); i++) {
            sb.append(params.get(i).getType().getGenericValue()).append(" ").append(params.get(i).getName());
            if (i < params.size() - 1) sb.append(", ");
        }
        sb.append(")");
        return sb.toString();
    }
}