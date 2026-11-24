# 头歌 API 接口文档

> 验证状态（2026-11-23）：本文的请求与响应示例是接口草案，尚未完成逐接口端到端验证。已登录 Edge 的页面流程、一次无签名课程查询及网络面板中的请求名见[接口实测记录](./接口实测记录.md)。请勿将示例中的签名、Cookie、状态码和字段变体直接当作已验证契约。

头歌 API 提供账号登录、课程与作业查询、编程题评测、实训文件与评测、WebSSH 终端等功能。JSON 接口的基地址为 `https://data.educoder.net`。请求示例中的标识和凭据均为占位值，响应示例展示接口的主要字段。

[鉴权与会话](#鉴权与会话) · [课程与作业](#课程与作业) · [单文件编程题](#单文件编程题) · [实训与多文件](#实训与多文件) · [WebSSH 终端](#webssh-终端) · [题面图片](#题面图片) · [补充接口](#补充接口)

## 鉴权与会话

### 公共请求格式

JSON 请求使用 UTF-8。查询参数中的值需要进行 URL 编码，例如文件名 `src/query.sql` 在查询参数中写作 `src%2Fquery.sql`。

| 参数或请求头 | 值 | 说明 |
| --- | --- | --- |
| `X-EDU-Type` | `pc` | 请求类型。 |
| `X-EDU-Timestamp` | Unix 毫秒时间戳 | 使用十进制字符串，例如 `1778378400000`。每次请求生成新时间戳。 |
| `X-EDU-Signature` | 32 位小写十六进制字符串 | 根据 HTTP 方法、签名参数和时间戳生成。 |
| `Cookie` | `_educoder_session=<session>; autologin_trustie=<remember_token>` | 登录后的请求携带会话 Cookie。收到 `autologin_trustie` 时一并携带。 |
| `Pc-Authorization` | `<session>` | 使用 `_educoder_session` 的值，同样随登录后的请求发送。 |
| `zzud` | 登录响应中的 `login` | 登录后的 JSON 请求将其放在 URL 查询参数中。附件 URL 与 WebSocket 连接地址使用接口提供的值。 |
| `Content-Type` | `application/json; charset=utf-8` | 随 JSON 请求体发送。 |
| `Origin`、`Referer` | `https://www.educoder.net`、`https://www.educoder.net/` | 随 POST 请求发送。 |
| `User-Agent` | `Mozilla/5.0` | 请求示例使用的标识。 |

**签名生成。** 将大写 HTTP 方法、`AK`、`SK` 和时间戳按以下顺序拼接。用 UTF-8 表示原文，执行标准 Base64 编码，再对 Base64 字符串计算 MD5，输出小写十六进制。原文中的时间戳与 `X-EDU-Timestamp` 使用相同值。

~~~text
原文    method=GET&ak={AK}&sk={SK}&time={TIMESTAMP}
签名    lowercase_hex(MD5(Base64(UTF8(原文))))
~~~

**响应状态。** 先检查 HTTP 状态，再检查 JSON 中的 `status` 和 `message`。评测请求的接收状态与最终测试结果分别由各端点定义。登录与课程查询展示公共请求头，其余端点的示例以请求行和请求体为主。

### 登录

**`POST /api/accounts/login.json`**

验证账号和密码，返回用户资料与后续请求需要的会话 Cookie。

| 请求体字段 | 类型 | 说明 |
| --- | --- | --- |
| `login` | string | 账号，例如平台登录名、手机号或邮箱。 |
| `password` | string | 密码原文，通过 HTTPS 传输。 |
| `autologin` | boolean | 传 `true` 以请求自动登录 Cookie。 |

~~~http
POST /api/accounts/login.json HTTP/1.1
Host: data.educoder.net
User-Agent: Mozilla/5.0
Origin: https://www.educoder.net
Referer: https://www.educoder.net/
Content-Type: application/json; charset=utf-8
X-EDU-Type: pc
X-EDU-Timestamp: <timestamp>
X-EDU-Signature: <signature>

{"login":"demo-user","password":"<password>","autologin":true}
~~~

~~~http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: _educoder_session=<session>; Path=/
Set-Cookie: autologin_trustie=<remember_token>; Path=/

{"user_id":101,"login":"demo-user","name":"示例用户","identity":"student"}
~~~

从 `Set-Cookie` 读取 `_educoder_session`，从响应体读取 `login` 作为后续请求的 `zzud`。出现非零 `status` 时按登录失败处理，`message` 提供错误说明。

~~~json
{"status":-3,"message":"用户名或密码错误"}
~~~

## 课程与作业

### 获取我的课程

**`GET /api/courses.json`**

按页查询当前用户的课程。查询参数 `page` 为从 1 开始的页码，`limit` 为每页条数，`order=mine` 表示我的课程，`search` 为搜索词，可传空字符串。

~~~http
GET /api/courses.json?page=1&limit=20&order=mine&search=&zzud=demo-user HTTP/1.1
Host: data.educoder.net
User-Agent: Mozilla/5.0
X-EDU-Type: pc
X-EDU-Timestamp: <timestamp>
X-EDU-Signature: <signature>
Cookie: _educoder_session=<session>; autologin_trustie=<remember_token>
Pc-Authorization: <session>
~~~

~~~json
{"courses_count":1,"courses":[{"id":1001,"identifier":"course-1","name":"示例课堂","is_end":false,"is_accessible":true}]}
~~~

`courses_count` 为课程总数。`courses[].identifier` 是下文课堂接口使用的课程短标识，`courses[].id` 为数值 ID。

### 获取课堂作业和测试列表

按课程短标识查询某一类作业或测试。四类请求均传 `id`、`coursesId`、`page` 和 `limit`，其中 `id` 与 `coursesId` 均填课程短标识。

| 类别 | 端点 | 查询参数 | 响应数组 |
| --- | --- | --- | --- |
| 编程作业 | `GET /api/courses/{course}/homework_commons/list.json` | `type=5` | `homeworks[]` |
| 实训作业 | `GET /api/courses/{course}/homework_commons.json` | `type=4&order=0&status=0` | `homeworks[]` |
| 课程设计 | `GET /api/courses/{course}/homework_commons.json` | `type=3` | `homeworks[]` |
| 课堂测试 | `GET /api/v2/courses/{course}/exercises.json` | `type=` | `exercises[]` |

~~~http
GET /api/courses/course-1/homework_commons/list.json?id=course-1&coursesId=course-1&type=5&page=1&limit=20&zzud=demo-user
GET /api/courses/course-1/homework_commons.json?id=course-1&coursesId=course-1&type=4&order=0&status=0&page=1&limit=20&zzud=demo-user
GET /api/courses/course-1/homework_commons.json?id=course-1&coursesId=course-1&type=3&page=1&limit=20&zzud=demo-user
GET /api/v2/courses/course-1/exercises.json?id=course-1&coursesId=course-1&type=&page=1&limit=20&zzud=demo-user
~~~

四类响应示例依次如下。作业或测试总数可见于 `all_count` 或 `total_count`。作业条目的 `homework_id` 或 `id` 用于作业详情，编程题入口使用 `start_identifier`，实训入口使用 `shixun_identifier`。空数组表示该分类本页无条目。

~~~jsonl
{"all_count":1,"homeworks":[{"homework_id":99,"name":"编程作业","start_identifier":"p1","all_count":2,"commit_count":0}]}
{"all_count":1,"homeworks":[{"homework_id":199,"name":"实训作业","shixun_identifier":"sx-1","challenge_count":2,"finished_challenge_count":0}]}
{"total_count":0,"homeworks":[]}
{"total_count":1,"exercises":[{"id":299,"exercise_name":"课堂测试"}]}
~~~

### 获取编程作业内的题目

**`GET /api/courses/{course}/homework_commons/hack_homework_detail.json`**

列出同一份编程作业包含的题目。查询参数 `id` 为数值作业 ID，`coursesId` 和 `course_id` 为课程短标识，`page` 为页码，`per_page` 与 `limit` 为分页条数。

~~~http
GET /api/courses/course-1/homework_commons/hack_homework_detail.json?id=99&coursesId=course-1&course_id=course-1&page=1&per_page=200&limit=200&zzud=demo-user
~~~

~~~json
{"data":[{"id":10,"identifier":"p1","name":"题目一","finish_status":0},{"id":11,"identifier":"p2","name":"题目二","finish_status":2}]}
~~~

题目列表也可能位于 `hack_settings[]`。题目入口字段包括 `start_identifier`、`identifier`、`hack_identifier` 和 `problem_identifier`。示例中的 `finish_status=2` 表示该题通过，`0`、`1` 表示未通过。若响应提供 `passed`、`is_passed` 或 `has_passed`，可依据相应布尔值判断。

## 单文件编程题

调用顺序为 **获取题目入口 → 启动沙箱 → 读取题面 → 保存代码 → 提交评测 → 查询结果**。同一题目可多次保存代码，每次提交评测使用当时已保存的代码。

### 启动个人沙箱

**`GET /api/problems/{start_identifier}/start.json`**

将题目入口标识换成当前用户的沙箱标识。响应中的 `identifier` 即后续 `myproblems` 请求的 `sandbox_id`。

~~~http
GET /api/problems/p1/start.json?zzud=demo-user
~~~

~~~json
{"status":0,"identifier":"sb-1"}
~~~

### 获取题面与当前代码

**`GET /api/myproblems/{sandbox_id}.json`**

读取题目描述、可选语言、代码和已有评测结果。示例查询参数为 `hidePopLogin=true`。

~~~http
GET /api/myproblems/sb-1.json?hidePopLogin=true&zzud=demo-user
~~~

~~~json
{
  "hack":{
    "id":10,"homework_common_id":99,"name":"示例题一","description":"输出一行文本",
    "language":"Python","all_language":["Python"],"code":"cHJpbnQoImhlbGxvIikK",
    "above_question":null,"under_question":"p2"
  },
  "test_case":{"input":""},
  "result":{"id":701,"status":0}
}
~~~

| 响应字段 | 类型 | 说明 |
| --- | --- | --- |
| `hack.description` | string | 题面文本。 |
| `hack.language`、`hack.all_language` | string、string[] | 当前语言与可选语言。 |
| `hack.code` | string | Base64 编码的代码。 |
| `hack.above_question`、`hack.under_question` | string 或 null | 相邻题目的入口标识。 |
| `test_case.input` | string | 样例输入。可能是明文或 Base64。 |
| `result` | object | 已有评测结果，存在时可用于回显。 |

### 保存代码

**`POST /api/myproblems/{sandbox_id}/update_code.json`**

保存沙箱中的代码草稿。`code` 是 UTF-8 源码的标准 Base64，示例解码为 `print("hello")` 加换行。`language` 取题目提供的语言名称。普通编程作业中的 `exercise_id` 和 `question_id` 传 `null`。

~~~http
POST /api/myproblems/sb-1/update_code.json?zzud=demo-user

{"code":"cHJpbnQoImhlbGxvIikK","language":"Python","exercise_id":null,"question_id":null}
~~~

~~~json
{"status":0,"message":"success"}
~~~

### 提交评测

**`POST /api/myproblems/{sandbox_id}/code_submit.json`**

提交已保存的代码进行评测。发送空 JSON 对象。`status=0` 表示提交请求成功。

~~~http
POST /api/myproblems/sb-1/code_submit.json?zzud=demo-user

{}
~~~

~~~json
{"status":0,"message":"提交成功"}
~~~

### 查询评测结果

**`GET /api/myproblems/{sandbox_id}/result.json`**

使用 `mode=submit` 查询提交结果。结果字段可能在 `data` 对象内，也可能在响应顶层。

~~~http
GET /api/myproblems/sb-1/result.json?mode=submit&zzud=demo-user
~~~

评测中。

~~~json
{"status":1,"message":"评测中"}
~~~

评测结束。

~~~json
{
  "status":0,"message":"评测完成",
  "data":{"id":702,"now_time":"2026-11-23 10:00:00","status":0,"passed":true,"output":"aGVsbG8K","expected_output":"aGVsbG8K"},
  "next_identifier":"p2"
}
~~~

| 结果字段 | 说明 |
| --- | --- |
| `id`、`now_time` | 提交 ID 和结果时间。可在提交前查询并记录旧值，提交后轮询至其中一项改变且评测结束，避免读取上次提交的结果。 |
| `status` | 结果中的 `0` 表示通过，负数表示失败，`1` 或 `2` 可表示进行中。包含 `data` 时使用 `data.status` 判断评测结果。 |
| `passed` | 结果缺少 `status` 时可使用该布尔值。 |
| `error_msg`、`input`、`output`、`expected_output` | 错误、输入、实际输出和期望输出。可能是明文、标准 Base64 或 URL-safe Base64，编码值可能省略尾部填充。 |
| `next_identifier` | 下一题的入口标识，可位于顶层或结果对象内。 |

## 实训与多文件

调用顺序为 **获取关卡 → 读取题面和文件 → 逐文件保存 → 触发构建 → 查询评测结果**。关卡详情中的标识分别用于任务、仓库、构建和终端接口。

### 进入实训并获取关卡标识

**`GET /api/shixuns/{shixun_identifier}/shixun_exec.json`**

使用作业条目中的 `shixun_identifier` 进入实训，查询参数 `homework_common_id` 为作业数值 ID。响应中的关卡标识通常为 `game_identifier`，也可见 `identifier` 或 `task_id`，字段可能位于顶层或 `data` 对象内。

~~~http
GET /api/shixuns/sx-1/shixun_exec.json?homework_common_id=199&zzud=demo-user
~~~

~~~json
{"status":0,"game_identifier":"task-1"}
~~~

### 获取关卡详情

**`GET /api/tasks/{task_id}.json`**

读取题面、文件列表、环境与相邻关卡。此处 `task_id` 为字符标识，查询参数 `homework_common_id` 为作业数值 ID。

~~~http
GET /api/tasks/task-1.json?homework_common_id=199&zzud=demo-user
~~~

~~~json
{
  "game":{"id":11,"identifier":"task-1"},
  "challenge":{"id":21,"subject":"示例 SQL 实训","task_pass":"编写查询","path":"src/setup.sql；src/query.sql"},
  "myshixun":{"identifier":"ms-1"},
  "tasks_files":[{"path":"src/setup.sql"},{"path":"src/query.sql"}],
  "shixun_environments":[{"id":31,"tab_type":1},{"id":32,"tab_type":4}],
  "prev_game":null,
  "next_game":"task-2"
}
~~~

| 响应字段 | 用途 |
| --- | --- |
| `game.identifier`、`game.id` | 字符标识用于 `tasks/{task_id}`，数值 ID 用于后续的 `game_id`，也可能在 `myshixun.game_id` 中提供。 |
| `challenge.id`、`challenge.subject`、`challenge.task_pass` | 关卡数值 ID、标题与题面。 |
| `myshixun.identifier` | 个人实训实例标识，用于仓库、文件保存和 WebSSH。 |
| `challenge.path` | 当前关卡前端在顶层 `st === 0` 且字段有值时，以全角分号拆分并丢弃空项，用得到的路径数组生成“代码文件”菜单，默认打开第一项。其他任务类型需单独核验。 |
| `shixun_environments[]` | 环境 ID 取 `shixun_environment_id` 或 `id`。`tab_type=1` 为代码环境，`tab_type=4` 为命令行环境。 |
| `prev_game`、`next_game` | 相邻关卡的任务标识，可用于查询对应关卡详情。 |

### 读取仓库目录

**`POST /api/myshixuns/{myshixun_identifier}/repository.json`**

列出个人实训仓库中的文件与子目录。查看根目录时传 `{}`，查看子目录时在请求体中传入相对于仓库根目录的 `path`。关卡详情没有列出完整文件时，可通过本接口发现文件。

~~~http
POST /api/myshixuns/ms-1/repository.json?zzud=demo-user

{"path":"src"}
~~~

~~~json
{"trees":[{"name":"setup.sql","type":"blob"},{"name":"query.sql","type":"blob"},{"name":"fixtures","type":"tree"}]}
~~~

`trees[].type=blob` 代表文件，`tree` 代表目录。实测条目还提供 `path`，优先直接使用它递归列目录、逐文件读取。此接口每次只列一个目录；完整工程需要递归遍历。`trees[]` 只说明可见文件，不能推断写权限或题目允许修改范围。

### 读取关卡文件

**`GET /api/tasks/{task_id}/rep_content.json`**

读取指定文件。查询参数 `path` 为相对于仓库根目录的文件名，`homework_common_id` 为作业 ID。

~~~http
GET /api/tasks/task-1/rep_content.json?path=src%2Fquery.sql&homework_common_id=199&zzud=demo-user
~~~

~~~json
{"status":0,"filename":"query.sql","language":"sql","content":{"content":"U0VMRUNUIDE7Cg=="}}
~~~

`content.content` 为 Base64 文件内容。示例解码为 `SELECT 1;` 加换行。

实测返回还包括 `size`、`language`、`file_type`、`filename`。自动解题按当前关卡“代码文件”菜单限制补丁。菜单数据来自关卡详情初始化，详见[接口实测记录](./接口实测记录.md)。

### 恢复文件初始版本

**`GET /api/tasks/{task_id}/reset_original_code.json`**

将指定文件恢复为初始版本，会覆盖远端文件的当前内容。查询参数包括仓库内文件名 `path`、关卡数值 ID `challenge_id` 和作业 ID `homework_common_id`。恢复后可通过 `rep_content.json` 读取恢复结果。

~~~http
GET /api/tasks/task-1/reset_original_code.json?path=src%2Fquery.sql&challenge_id=21&homework_common_id=199&zzud=demo-user
~~~

~~~json
{"status":0,"message":"success"}
~~~

### 保存关卡文件

**`POST /api/myshixuns/{myshixun_identifier}/update_file.json`**

每次请求保存一个文件。准备提交多个文件时，前几个文件传 `evaluate=0`，最后一个文件传 `evaluate=1`。仅提交一个文件时传 `1`。最后一次请求返回后续构建使用的 `sec_key` 和 `resubmit`。

本次 Edge 页面按 Ctrl+S 保存 JSP 时实测 `evaluate=0`、HTTP 200，响应含 `content.commitID`、`content.content`、`content.size`、`resubmit`、`sec_key`。上段关于 `evaluate=1` 的行为仍是原文档约定，本次未单独核验。保存 API 成功不证明文件属于题目允许修改范围：`src/test/HelloWorldTest1.java` 的空行修改也被接受，核验后已恢复。

| 请求体字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | 仓库内文件名。 |
| `content` | string | 源码或 SQL 原文，按 JSON 字符串规则转义。 |
| `evaluate` | integer | `0` 保存文件，`1` 保存并返回本次评测参数。 |
| `game_id` | integer | 关卡数值 ID。 |
| `tab_type` | integer | 代码文件传 `1`。 |
| `exercise_id` | integer 或 null | 普通实训作业传 `null`。 |
| `homework_common_id` | integer | 作业 ID。 |
| `extras` | object | `challenge_id` 为关卡数值 ID，`homework_common_id` 为作业 ID 的字符串形式，`currentUserId` 为用户数值 ID。其余字段见普通作业示例。 |

~~~http
POST /api/myshixuns/ms-1/update_file.json?zzud=demo-user

{
  "path":"src/query.sql",
  "evaluate":1,
  "content":"SELECT 1;\n",
  "game_id":11,
  "tab_type":1,
  "exercise_id":null,
  "homework_common_id":199,
  "extras":{
    "exercise_id":"","question_id":"","challenge_id":21,"subject_id":"",
    "homework_common_id":"199","competition_entry_id":"","currentUserId":101
  }
}
~~~

~~~json
{"status":0,"sec_key":"demo-evaluation-key","resubmit":0}
~~~

### 触发构建与评测

**`POST /api/tasks/{task_id}/game_build.json`**

在代码环境中构建已保存文件并触发评测。传入最后一次 `update_file` 返回的 `sec_key` 和 `resubmit`，以及关卡详情中代码环境的 `shixun_environment_id`。`resubmit` 在请求体中以字符串传递。普通作业构建示例使用 `first=1`、`content_modified=0` 和 `tab_type=1`。`extras` 中的 `challenge_id` 为关卡数值 ID，`homework_common_id` 为作业 ID 的字符串形式。

~~~http
POST /api/tasks/task-1/game_build.json?zzud=demo-user

{
  "sec_key":"demo-evaluation-key",
  "resubmit":"0",
  "first":1,
  "content_modified":0,
  "shixun_environment_id":31,
  "tab_type":1,
  "extras":{
    "exercise_id":"","question_id":"","challenge_id":21,"subject_id":"",
    "homework_common_id":"199","competition_entry_id":""
  }
}
~~~

~~~json
{"status":1,"message":"评测中","resubmit":"1"}
~~~

`status=1` 表示已接收评测，负数表示业务错误。响应包含新的 `resubmit` 时，查询结果使用新的值。

### 查询实训评测结果

**`GET /api/tasks/{task_id}/game_status.json`**

传入评测令牌 `sec_key`、最近返回的 `resubmit`、关卡数值 ID `challenge_id` 和作业 ID `homework_common_id`。普通作业的查询示例传 `time_out=false`、`port=0` 及空的 `subject_id`。

~~~http
GET /api/tasks/task-1/game_status.json?sec_key=demo-evaluation-key&resubmit=1&challenge_id=21&homework_common_id=199&time_out=false&port=0&subject_id=&zzud=demo-user
~~~

评测进行中。

~~~json
{"running_code_status":1,"running_code_message":"评测中"}
~~~

评测完成且存在失败用例。

~~~json
{
  "status":0,
  "sets_error_count":1,
  "test_sets":[{"input":"MQ==","output":"Mg==","actual_output":"Mw==","result":false}],
  "last_compile_output":"输出不匹配"
}
~~~

| 响应字段 | 说明 |
| --- | --- |
| `running_code_status`、`running_code_message` | 运行状态与提示。仅有等待或运行提示时可延时轮询。 |
| `is_sub_pass` | 存在时给出提交是否通过。 |
| `sets_error_count` | 失败的测试组数。`0` 表示没有失败用例。 |
| `test_sets[].result` | 单组是否通过。缺少汇总字段时可用非空结果列表中的逐组状态判断。 |
| `test_sets[].input`、`output`、`actual_output` | 输入、期望输出与实际输出，可能是明文或 Base64。 |
| `last_compile_output` | 编译及运行诊断，可用于展示失败原因。 |

示例中的顶层 `status=0` 表示请求成功，失败组数为 1，评测结果为未通过。

## WebSSH 终端

### 启动终端

**`GET /api/myshixuns/{myshixun_identifier}/start.json`**

启动实训环境的命令行会话。传入关卡详情中的命令行环境 ID、数值 `game_id`、课程短标识 `coursesId`、作业 ID `homework_common_id` 和 `tab_type=4`。

~~~http
GET /api/myshixuns/ms-1/start.json?shixun_environment_id=32&tab_type=4&game_id=11&coursesId=course-1&homework_common_id=199&zzud=demo-user
~~~

~~~json
{
  "status":0,
  "data":{
    "link_url":"wss://webssh.educoder.net/ws",
    "host":"terminal.example.invalid",
    "port":"2200",
    "username":"demo",
    "password":"<terminal-password>",
    "remaining_time":1800000
  }
}
~~~

`link_url` 为本次 WebSocket 地址，`host`、`port`、`username` 和 `password` 为该会话的连接参数。`remaining_time` 存在时以毫秒表示剩余时间。连接参数通常位于 `data` 对象，亦可位于顶层。

### 收发 WebSocket 数据帧

连接响应中的 `link_url`，握手发送 `Origin: https://www.educoder.net` 和 `Referer: https://www.educoder.net/`。连接后首先发送 `init` 文本帧，`data` 使用启动接口返回的连接对象，可补充终端尺寸。如果连接对象缺少 `secret`，以本次会话的 `password` 填充。

`tp` 值 `init`、`client`、`resize`、`h` 分别表示初始化、键盘输入、调整尺寸和心跳。每行是一个独立的 JSON 文本帧。

~~~jsonl
{"tp":"init","data":{"link_url":"wss://webssh.educoder.net/ws","host":"terminal.example.invalid","port":"2200","username":"demo","password":"<terminal-password>","secret":"<terminal-password>","remaining_time":1800000,"columns":80,"rows":24,"width":760,"height":432}}
{"tp":"client","data":"pwd\r"}
{"tp":"resize","data":{"columns":100,"rows":30,"width":900,"height":540}}
{"tp":"h"}
~~~

服务端输出可为原始内容或标准 Base64 文本。例如 `L2hvbWUvZGVtbwo=` 解码为 `/home/demo` 加换行。会话断开后可再次调用启动接口获取连接参数。

## 题面图片

从题面 Markdown 或 HTML 中提取附件 URL。相对地址可基于 `https://data.educoder.net` 补全。请求受保护的头歌附件时携带签名与会话请求头。响应体为图片字节，媒体类型由 `Content-Type` 指定。

~~~http
GET /api/attachments/1 HTTP/1.1
Host: data.educoder.net
Accept: image/*
~~~

~~~http
HTTP/1.1 200 OK
Content-Type: image/png

<PNG 图片字节>
~~~

## 补充接口

以下请求沿用公共鉴权约定。课堂资源接口中的 `course-1` 是课程短标识，实训扩展接口中的 `199` 是作业数值 ID。表中的响应仅列出对应场景所需的主要字段。

| 用途 | 请求示例 | 响应示例 |
| --- | --- | --- |
| 获取课堂概要 | `GET /api/courses/course-1/top_banner.json?id=course-1&zzud=demo-user` | `{"name":"示例课堂","teacher_name":"示例教师"}` |
| 获取课堂导航 | `GET /api/courses/course-1/left_banner.json?id=course-1&zzud=demo-user` | `{"course_modules":[],"hidden_modules":[]}` |
| 获取课堂公告 | `GET /api/courses/course-1/informs.json?id=course-1&coursesId=course-1&page=1&limit=20&zzud=demo-user` | `{"informs":[],"informs_count":0}` |
| 获取个人沙箱提交记录 | `GET /api/myproblems/sb-1/submit_records.json?zzud=demo-user` | `{"records":[{"status":0,"language":"Python"}],"records_count":1}` |
| 同步作答时长，`answer_long_time` 单位为毫秒 | `GET /api/myproblems/sb-1/save_long_time.json?answer_long_time=60000&zzud=demo-user` | `{"status":0}` |
| 获取实训作业详情 | `GET /api/homework_commons/199.json?zzud=demo-user` | `{"homework_id":199,"homework_name":"实训作业","shixun_identifier":"sx-1"}` |
| 获取实训关卡与进度 | `GET /api/homework_commons/199/shixun_challenge_data.json?zzud=demo-user` | `{"data":{"challenge_settings":[{"challenge_id":21,"challenge_name":"第一关","passed_status":0}],"passed_count":0}}` |
| 获取实训概要及可进入状态 | `GET /api/shixun_homeworks/199/header_info.json?zzud=demo-user` | `{"data":{"homework_id":199,"is_enter_shixun":true,"challenges":[]}}` |
| 将工作环境文件提交至仓库 | `GET /api/tasks/task-1/commit_files.json?shixun_environment_id=31&zzud=demo-user` | `{"status":0,"message":"success"}` |
| 拉取仓库文件到工作环境 | `GET /api/tasks/task-1/pull_files.json?shixun_environment_id=31&zzud=demo-user` | `{"status":0,"message":"success"}` |
