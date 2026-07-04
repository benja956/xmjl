# 📊 一建注册项目经理台账系统 - 数据库设计与维护手册

本系统采用 **Cloudflare D1 (基于 SQLite 架构)** 作为底层数据库，用于支撑项目经理资质与参建工程业绩的投标及备案状态分析。为了保证系统在未来交接与维护时的可读性，特制定本数据库文档。

---

## 🏗️ 1. 实体关系模型 (Entity-Relationship)

系统在业务上主要维护两个核心实体：
*   **项目经理/负责人 (Managers)**：存放静态个人资质属性。
*   **参建项目业绩 (Projects/Filing Records)**：存放项目属性，并作为关联表记录人员在项目中担当的岗位。

```
+--------------------+               +------------------+
|  project_managers  |               |     projects     |
+--------------------+               +------------------+
| name (Primary Key) | < - - - - - - | manager_name     |
| title              | (逻辑关联)    | project_name     |
| title_major        |               | role (项 / 技)   |
| cert_name          |               | area             |
| cert_major         |               | amount           |
| safety_cert        |               | duration (在建/竣工)
| memo               |               | record_status    |
+--------------------+               | filing_status    |
                                     | filing_end       |
                                     +------------------+
```

> **设计考量**：
> 人员和业绩通过 `manager_name` 形成**一对多 (1:N)** 的逻辑外键关系。未采用三张表（人员表、项目表、人员项目关联表）的经典多对多设计，是为了适应云端 Serverless D1 数据库的高并发读取，避免复杂的 `JOIN` 联表开销，提升边缘计算节点（Edge Workers）的响应响应速度。

---

## 🗄️ 2. 表结构详细设计 (Data Dictionary)

### 2.1 人员基本信息表 `project_managers`

*   **表用途**：存储项目经理/技术负责人的静态资质、执业证书和安考证等档案。

| 字段名称 | 物理类型 | 约束条件 | 业务含义说明 | 存储规范与数据清洗示例 |
| :--- | :--- | :--- | :--- | :--- |
| **`name`** | `TEXT` | `PRIMARY KEY` | **姓名 (主键)** | 姓名中不得包含空格。如 `侯兴宝` |
| `title` | `TEXT` | `DEFAULT ''` | 职称等级 | 如：`高级工程师`、`正高级工程师`、`工程师` |
| `title_major`| `TEXT` | `DEFAULT ''` | 职称专业及时间 | 统一格式为 `[专业名称][空格][发证日期]`。如：`建筑工程 2021.12.31` |
| `cert_name` | `TEXT` | `DEFAULT ''` | 执业资格证书名称 | 默认为：`一级建造师` |
| `cert_major` | `TEXT` | `DEFAULT ''` | 注册执业专业 | 存入前需用英文半角逗号分隔。如：`建筑工程,市政公用工程` |
| `safety_cert`| `TEXT` | `DEFAULT ''` | 安全合格证 (安考) | 仅存储单个大写字母：`A`、`B`、`C` (分别代表A证、B证、C证) |
| `memo` | `TEXT` | `DEFAULT ''` | 人员备注信息 | 用于记录无法投成都市标原因、协作技术负责人等自由文本 |

---

### 2.2 工程项目业绩表 `projects`

*   **表用途**：记录项目详情，并在此行指定该项目中的参建岗位（如项目经理、技术负责人）。

| 字段名称 | 物理类型 | 约束条件 | 业务含义说明 | 存储规范与数据清洗示例 |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | **主键 ID** | 自增 ID |
| `manager_name`| `TEXT` | `NOT NULL` | **参建负责人姓名** | 逻辑关联 `project_managers.name` |
| `project_name`| `TEXT` | `NOT NULL` | **工程项目名称** | 须做标点符号归一化。括号统一使用中文全角 `（）` |
| `role` | `TEXT` | `NOT NULL` | **担当职务岗位** | 必须限定为以下两个值之一：`项目经理` 或 `技术负责人` |
| `area` | `TEXT` | `DEFAULT ''` | 建筑面积 | 带有单位 of 文本。如 `239334.53平方米` 或 `16.4万平方米` |
| `amount` | `TEXT` | `DEFAULT ''` | 合同金额 | 带有单位 of 文本。如 `138531万元` 或 `约 20000万元` |
| `duration` | `TEXT` | `DEFAULT ''` | 工期/开竣工时间 | 格式为 `YYYY.MM.DD-YYYY.MM.DD`。**如果在建，必须填写 `在建`** |
| `record_status`| `TEXT` | `DEFAULT ''` | 四库平台备案入库 | 常规值包括：`已备案`、`无`、`分块备案` |
| `filing_status`| `TEXT` | `DEFAULT ''` | 云端/证书备案状态 | 常规值包括：`备案中`、`—` |
| `filing_post` | `TEXT` | `DEFAULT ''` | 云端备案登记岗位 | 如：`项目经理`、`技术负责人` |
| `filing_start`| `TEXT` | `DEFAULT ''` | 备案生效起始时间 | 格式统一为 `YYYY-MM-DD`。如 `2026-01-01` |
| `filing_end` | `TEXT` | `DEFAULT ''` | 备案预计结束时间 | 格式统一为 `YYYY-MM-DD`。如 `2027-12-31` |

---

## 🧠 3. 核心业务状态流转规则 (Business Logic)

系统最重要的业务逻辑是判定**“某项目经理当前是否空闲（可用于新投标）”**。此状态完全基于 `projects` 表中的项目状况动态判定，规则如下：

```
                    ┌──────────────────────────────┐
                    │ 扫描该经理名下的所有项目业绩  │
                    └──────────────┬───────────────┘
                                   │
                是否包含任何 '在建' 项目？
                或包含任何 '备案中' 的项目？
               ┌───────────[是]────┴────[否]───────────┐
               ▼                                       ▼
     ┌──────────────────┐                    ┌──────────────────┐
     │ 判定状态为: Locked│                    │  判定状态为: Idle │
     │  (在建锁定，红标) │                    │  (空闲可用，绿标) │
     └──────────────────┘                    └──────────────────┘
```

> **状态判定算法 (TypeScript 实现)**：
> ```typescript
> const getManagerStatus = (managerProjects: Project[]) => {
>   // 1. 如果名下没有项目，自然空闲
>   if (managerProjects.length === 0) return 'idle';
>   
>   // 2. 检查是否有任何项目的工期是“在建”
>   const hasActiveProject = managerProjects.some(p => p.duration && p.duration.includes('在建'));
>   
>   // 3. 检查是否有任何项目正处于云端“备案中”
>   const hasActiveFiling = managerProjects.some(p => p.filing_status && p.filing_status.includes('备案中'));
>   
>   return (hasActiveProject || hasActiveFiling) ? 'locked' : 'idle';
> };
> ```

---

## 🚀 4. wrangler 常用维护命令指南

系统数据库在本地使用 wrangler 模拟运行，线上部署在 Cloudflare D1。维护人员请使用以下指令进行数据同步 and 管理：

### 4.1 本地开发环境维护 (Local)

*   **本地初始化/重建数据库** (拉起并执行 `import.sql`)：
    ```bash
    npx wrangler d1 execute xmjl-db --local --file=./import.sql
    ```
*   **本地查看数据库表结构/运行 SQL 查询**：
    ```bash
    npx wrangler d1 execute xmjl-db --local --command="SELECT name, cert_major FROM project_managers LIMIT 5;"
    ```
*   **本地数据导出备份**：
    wrangler 状态位于 `backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`，可直接复制后缀为 `.sqlite` 的二进制文件进行冷备份。

### 4.2 线上生产环境维护 (Remote/Production)

*   **向线上云数据库导入/同步数据**：
    ```bash
    npx wrangler d1 execute xmjl-db --remote --file=./import.sql
    ```
*   **线上执行特定 SQL 修正语句**：
    ```bash
    npx wrangler d1 execute xmjl-db --remote --command="UPDATE projects SET duration = '2020.4.3-2021.7.30' WHERE id = 12;"
    ```

---

## ⚠️ 5. 维护防错防呆注意事项

1.  **姓名防呆**：
    `project_managers.name` 与 `projects.manager_name` 是强字符对齐。在录入或修改人员名字时，**必须确保两边完全一致且无前后空格**，否则对应的项目业绩会“凭空消失”（因为外键关联匹配失败）。
2.  **项目重名合并**：
    工程业绩视图依靠 `project_name` 进行 `Group By` 聚合。如果是同一个项目的不同参建负责人，**必须确保两者的 `project_name` 字字对应，且全半角标点符号完全统一**，否则会在前端被拆分为两个不同的项目。
3.  **工期格式控制**：
    当一个项目竣工时，必须把 `duration` 字段的 `在建` 改为具体的竣工日期（如 `2025.12.31`），否则该人员将永远处于“锁定（红标）”状态。
