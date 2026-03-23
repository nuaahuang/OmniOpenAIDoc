package io.github.omni;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.thoughtworks.qdox.JavaProjectBuilder;
import com.thoughtworks.qdox.model.JavaClass;
import com.thoughtworks.qdox.model.JavaMethod;
import com.thoughtworks.qdox.model.JavaParameter;
import org.apache.maven.execution.MavenSession;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;
import org.apache.maven.project.MavenProject;

import java.io.File;
import java.nio.file.Paths;
import java.util.*;

/**
 * OmniSense Producer: Injects Semantic Manifest into artifacts and local project root.
 * Aligned with Open-Omni Protocol v1.0 [SPEC_V1]
 */
@Mojo(name = "generate", defaultPhase = LifecyclePhase.PROCESS_CLASSES)
public class GenerateManifestMojo extends AbstractMojo {

    @Parameter(defaultValue = "${project}", readonly = true)
    private MavenProject project;

    @Parameter(defaultValue = "${session}", readonly = true)
    private MavenSession session;

    /**
     * Relative path from the multi-module root, e.g., .omni/manifests
     */
    @Parameter(property = "omni.globalOutputRelPath", defaultValue = ".omni/manifests")
    private String globalOutputRelPath;

    @Override
    public void execute() throws MojoExecutionException {
        getLog().info("OmniSense [v1.0] scanning module: " + project.getArtifactId());

        try {
            JavaProjectBuilder builder = new JavaProjectBuilder();
            builder.setErrorHandler(e -> getLog().warn("Parsing error (skipped): " + e.getMessage()));

            List<String> sourceRoots = project.getCompileSourceRoots();
            if (sourceRoots == null || sourceRoots.isEmpty()) {
                return;
            }

            for (String root : sourceRoots) {
                File rootFile = new File(root);
                if (rootFile.exists()) {
                    builder.addSourceTree(rootFile);
                }
            }

            // --- 1. Construct Protocol Metadata (SPEC_V1) ---
            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("protocol", "open-omni/1.0");
            manifest.put("module", project.getArtifactId());
            manifest.put("version", project.getVersion());
            manifest.put("timestamp", System.currentTimeMillis());

            // --- 2. Build Domain Aggregation (Class -> Methods) ---
            List<Map<String, Object>> classesList = new ArrayList<>();
            for (JavaClass cls : builder.getClasses()) {
                if (cls.isPublic() && !cls.isInner() && !cls.getName().endsWith("Test")) {

                    Map<String, Object> classNode = new LinkedHashMap<>();
                    classNode.put("class", cls.getFullyQualifiedName());
                    classNode.put("comment", getCleanComment(cls.getComment()));

                    List<Map<String, Object>> methodsList = new ArrayList<>();
                    for (JavaMethod method : cls.getMethods()) {
                        if (method.isPublic()) {
                            Map<String, Object> methodNode = new LinkedHashMap<>();
                            methodNode.put("signature", buildSignature(method));
                            methodNode.put("description", buildFullMethodDescription(method));
                            methodNode.put("annotations", Collections.emptyList()); // Placeholder for V1.1
                            methodsList.add(methodNode);
                        }
                    }

                    if (!methodsList.isEmpty()) {
                        classNode.put("methods", methodsList);
                        classesList.add(classNode);
                    }
                }
            }
            manifest.put("apis", classesList);

            if (classesList.isEmpty()) {
                getLog().info("No public APIs found. Skipping.");
                return;
            }

            ObjectMapper mapper = new ObjectMapper();
            mapper.enable(SerializationFeature.INDENT_OUTPUT);

            // --- 3. Output A: Embedded in JAR (target/classes/META-INF) ---
            File classesMetaInf = new File(project.getBuild().getOutputDirectory(), "META-INF");
            if (!classesMetaInf.exists()) {
                classesMetaInf.mkdirs();
            }
            File jarManifestFile = new File(classesMetaInf, "omni-manifest.json");
            mapper.writeValue(jarManifestFile, manifest);

            // --- 4. Output B: Synced to Project Root (Global Aggregation) ---
            File rootDir = getProjectRoot();

            // 使用 java.nio.file.Path 进行物理路径拼接，它能自动处理绝对路径冲突
            java.nio.file.Path globalPath = Paths.get(rootDir.getAbsolutePath(), globalOutputRelPath).normalize();
            File globalDir = globalPath.toFile();
            getLog().warn("root path" + globalPath);

            if (!globalDir.exists()) {
                // 使用更底层的 Files.createDirectories 确保目录权限和路径正确
                try {
                    java.nio.file.Files.createDirectories(globalPath);
                } catch (java.io.IOException e) {
                    getLog().warn("Failed to create directory via NIO: " + e.getMessage());
                    globalDir.mkdirs(); // 降级方案
                }
            }

            File globalFile = new File(globalDir, project.getArtifactId() + ".json");
            mapper.writeValue(globalFile, manifest);

            getLog().info("✅ Corrected Semantic Sync: " + globalFile.getAbsolutePath());
        } catch (Exception e) {
            getLog().error("OmniSense sync failed: " + e.getMessage(), e);
        }
    }

    /**
     * Resolves the absolute project root directory, handling Maven multi-module contexts.
     */
    private File getProjectRoot() {
        String multiModuleDir = System.getProperty("maven.multiModuleProjectDirectory");
        java.nio.file.Path rootPath;

        if (multiModuleDir != null && !multiModuleDir.isEmpty()) {
            rootPath = Paths.get(multiModuleDir);
        } else if (session.getExecutionRootDirectory() != null) {
            rootPath = Paths.get(session.getExecutionRootDirectory());
        } else {
            // 最后的兜底：如果以上都失效，取当前 project 的 basedir
            rootPath = project.getBasedir().toPath();
        }

        return rootPath.toAbsolutePath().normalize().toFile();
    }

    /**
     * Merges main comment with @param and @return tags for rich LLM context.
     */
    private String buildFullMethodDescription(JavaMethod method) {
        StringBuilder desc = new StringBuilder();
        String mainComment = getCleanComment(method.getComment());
        if (!mainComment.isEmpty()) {
            desc.append(mainComment).append("\n");
        }
        method.getTagsByName("param").forEach(tag -> desc.append("@param ").append(tag.getValue()).append("\n"));
        method.getTagsByName("return").forEach(tag -> desc.append("@return ").append(tag.getValue()).append("\n"));
        return desc.toString().trim();
    }

    private String getCleanComment(String comment) {
        return (comment != null) ? comment.trim() : "";
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
            if (i < params.size() - 1) {
                sb.append(", ");
            }
        }
        sb.append(")");
        return sb.toString();
    }
}