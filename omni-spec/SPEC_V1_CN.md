# Open-Omni Protocol Specification (v1.0) 📄

> **标准定义：面向 LLM 的软件语义分发协议** > **核心目标：消除因版本差异导致的 API 漂移与 AI 逻辑幻觉**

---

## 1. 协议愿景 (Vision)

在软件供应链 2.0 时代，分发产物不应仅仅是“不可读”的二进制（Binary），还必须包含“可理解”的语义（Semantics）。**Open-Omni** 协议通过将源码中的契约与业务逻辑（Javadoc/Annotations）解构并随包分发，确保 AI 助手能够基于**当前生效的精确版本**进行推理。

### 🎯 核心痛点定义：
1. **API 漂移 (API Drift)**：在大型工程中，二方包、三方包二进制依赖（JAR）版本更新后，AI 仍基于旧版缓存或通用模型知识生成代码，导致调用失败。
2. **AI 幻觉 (AI Hallucination)**：AI 无法感知闭源依赖（JAR/WHL）内部的业务注释和约束，从而基于概率分布产生错误的逻辑推断。

---

## 2. 传输载体与路径 (Distribution)

协议规定，语义清单文件命名为 `omni-manifest.json`。为了实现“发布即文档”，该文件必须在构建阶段双向注入：

- **产物注入 (Inside Artifact)**：存储于 `META-INF/omni-manifest.json`。确保 `mvn install` 后，语义随 JAR 包进入本地仓库或私服。
- **工程同步 (Local Workspace)**：存储于项目根目录 `.omni/manifests/${artifactId}.json`。用于本地多模块开发时，IDE 插件能即时感知同工程内其他模块的变更。

---

## 3. 数据结构规范 (Schema)

清单采用 **“领域聚合式”** 结构，以类（Class）作为语义边界，最大限度降低冗余并提升 AI 检索效率。

### 3.1 根节点元数据 (Root Metadata)
| 字段 | 类型 | 必选 | 说明 |
| :--- | :--- | :--- | :--- |
| `protocol` | String | 是 | 协议版本标识，固定为 `Open-Omni/1.0` |
| `module` | String | 是 | 模块唯一标识符 (Maven ArtifactId) |
| `version` | String | 是 | **核心锚点**：当前构建的精确版本号。用于防止 API 漂移。 |
| `timestamp` | Long | 否 | 生成时的 Unix 时间戳，用于增量同步判断。 |
| `apis` | Array | 是 | 类聚合列表（见 3.2）。 |

### 3.2 类节点结构 (Class Node)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `class` | String | 类的全限定名（如 `cn.kn.pc.account.PayAccount`）。 |
| `comment` | String | **类级语义**：定义该类的领域定位（如：它是领域模型还是数据库映射）。 |
| `methods` | Array | 该类导出的公共方法集合（见 3.3）。 |

### 3.3 方法节点结构 (Method Node)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `signature` | String | 完整的方法签名（返回类型 + 名称 + 参数序列）。 |
| `description` | String | **业务约束**：方法级 Javadoc，包含调用限制、幂等要求等核心逻辑。 |
| `annotations`| Array | [预留] 关键注解（如 `@PostMapping`, `@RequiresPermissions`）。 |

---

## 4. 生产端实现准则 (Producer Constraints)

1. **静态分析 (Static Analysis)**：必须通过 AST（如 QDox/JavaParser）分析源码，严禁使用运行时反射，确保环境无关性。
2. **强制解构 (Mandatory Deconstruction)**：必须保留 Javadoc 中的关键语义，如 `@param` 描述和 `@return` 含义。
3. **版本锚定 (Version Anchoring)**：生成的清单必须包含真实的 `version` 字段，严禁硬编码。
4. **归类存储**：必须按照 `Class -> Methods` 的嵌套结构组装 JSON，不得平铺。

---

## 5. 消费端实现准则 (Consumer Constraints)

1. **物理还原 (Shadow Generation)**：消费端插件应按类名生成物理 `.java` 影子文件，还原其语义外壳。
2. **影子路径隔离**：影子文件必须存放在 `.omni/temp_sources/`，且必须被 Git 忽略。
3. **漂移检测 (Drift Detection)**：若探测到本地依赖包的版本与 `omni-manifest.json` 中的版本不符，应强制触发重新同步。
4. **Context 引导**：通过 `.cursorrules` 明确告知 AI：*“`.omni/` 目录是跨模块调用的唯一真理来源”*。

---

## 6. 标准样例 (Example)

```json
{
  "protocol": "Open-Omni/1.0",
  "module": "pc-account",
  "version": "1.0-SNAPSHOT",
  "timestamp": 1711110000000,
  "apis": [
    {
      "class": "cn.kn.pc.account.PayAccount",
      "comment": "支付账户核心领域模型",
      "methods": [
        {
          "signature": "boolean isHot()",
          "description": "判断是否为热点账户。高频交易时需注意并发锁定。"
        }
      ]
    }
  ]
}