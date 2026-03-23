# Open-Omni Protocol Specification (v1.0) 📄

> **Standard Definition: Semantic Distribution Protocol for LLMs** > **Core Objective: Eliminate API Drift and AI Logical Hallucination caused by version discrepancies.**

---

## 1. Vision

In the era of Software Supply Chain 2.0, distribution artifacts should no longer be just "unreadable" binaries; they must include "understandable" semantics. The **Open-Omni** protocol deconstructs source code contracts and business logic (Javadocs/Annotations) and distributes them alongside the package. This ensures that AI assistants perform reasoning based on the **precise, currently active version** of the software.

### 🎯 Core Pain Points:
1. **API Drift**: In large-scale projects, when binary dependencies (JARs) for internal or third-party libraries are updated, AI often continues to generate code based on stale caches or general model knowledge, leading to integration failures.
2. **AI Hallucination**: AI cannot perceive business comments and constraints hidden inside closed-source dependencies (JAR/WHL), leading to incorrect logical inferences based on mere probability distributions.

---

## 2. Distribution & Pathing

The protocol stipulates that the semantic manifest file be named `omni-manifest.json`. To achieve "Shipping as Documentation," this file must be bidirectionally injected during the build phase:

- **Artifact Injection (Inside Artifact)**: Stored at `META-INF/omni-manifest.json`. This ensures that after a `mvn install`, the semantics follow the JAR into the local repository or private artifactory.
- **Local Workspace Sync**: Stored at the project root under `.omni/manifests/${artifactId}.json`. This allows IDE plugins to instantly perceive changes in other modules within the same multi-module project during local development.

---

## 3. Schema Specification

The manifest utilizes a **"Domain Aggregation"** structure, using the Class as the semantic boundary to minimize redundancy and maximize AI retrieval efficiency.

### 3.1 Root Metadata
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `protocol` | String | Yes | Protocol version identifier, fixed as `open-omni/1.0`. |
| `module` | String | Yes | Unique module identifier (e.g., Maven ArtifactId). |
| `version` | String | Yes | **Core Anchor**: The exact version of the current build. Used to prevent API Drift. |
| `timestamp` | Long | No | Unix timestamp of generation, used for incremental sync logic. |
| `apis` | Array | Yes | List of aggregated Class nodes (see 3.2). |

### 3.2 Class Node Structure
| Field | Type | Description |
| :--- | :--- | :--- |
| `class` | String | Fully qualified name of the class (e.g., `cn.kn.pc.account.PayAccount`). |
| `comment` | String | **Class-level Semantics**: Defines the domain role (e.g., Domain Model or Database Mapper). |
| `methods` | Array | Collection of exported public methods (see 3.3). |

### 3.3 Method Node Structure
| Field | Type | Description |
| :--- | :--- | :--- |
| `signature` | String | Complete method signature (Return Type + Name + Parameter Sequence). |
| `description` | String | **Business Constraints**: Method-level Javadoc including call limits, idempotency requirements, etc. |
| `annotations`| Array | [Reserved] Key annotations (e.g., `@PostMapping`, `@RequiresPermissions`). |

---

## 4. Producer Implementation Constraints

1. **Static Analysis**: Semantics must be extracted via AST (Abstract Syntax Tree) analysis (e.g., QDox/JavaParser). Runtime reflection is strictly prohibited to ensure environment independence.
2. **Mandatory Deconstruction**: Key semantic metadata from Javadocs, such as `@param` descriptions and `@return` meanings, must be preserved.
3. **Version Anchoring**: The generated manifest must contain the actual `version` field from the build system; hardcoding is prohibited.
4. **Grouped Storage**: Data must be assembled in the nested `Class -> Methods` structure; flat list formats are not compliant.

---

## 5. Consumer Implementation Constraints

1. **Shadow Generation**: Consumer plugins should generate physical `.java` shadow files based on the class names to restore the semantic shell.
2. **Path Isolation**: Shadow files must be stored in `.omni/temp_sources/` and must be excluded from version control (via `.gitignore`).
3. **Drift Detection**: If the version of a local dependency package does not match the version recorded in `omni-manifest.json`, a re-sync must be triggered.
4. **Context Guidance**: Use `.cursorrules` to explicitly instruct the AI: *"The `.omni/` directory is the Sole Source of Truth for cross-module calls."*

---

## 6. Standard Example

```json
{
  "protocol": "open-omni/1.0",
  "module": "pc-account",
  "version": "1.0-SNAPSHOT",
  "timestamp": 1711110000000,
  "apis": [
    {
      "class": "cn.kn.pc.account.PayAccount",
      "comment": "Core domain model for payment accounts.",
      "methods": [
        {
          "signature": "boolean isHot()",
          "description": "Determines if it is a hot account. Pay attention to concurrency locking during high-frequency trading."
        }
      ]
    }
  ]
}