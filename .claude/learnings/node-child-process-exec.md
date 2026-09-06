# Node child_process exec 계열과 시스템 콜 exec()의 관계

## 2026-09-06 — cleanup-detect.js의 execFileSync 사용을 시스템 프로그래밍 exec()와 비교하며 정리

### spawn/exec/execFile 중 어떤 것이 셸을 거치는가

`child_process`의 4가지 생성 함수(`spawn`, `exec`, `execFile`, `fork`)는 "셸(`/bin/sh`)을 거치는가"로 크게 둘로 나뉜다.

- `exec(command, ...)` / `execSync(command, ...)` — 명령어 전체를 **문자열 하나**로 받는다. Node가 내부적으로 이 문자열을 그대로 셸에 넘긴다. POSIX 계열에서는 사실상 아래와 동일하게 동작한다:

```js
// 프로젝트 코드 아님 — exec()가 내부적으로 하는 일을 보여주는 개념적 재현
execFile("/bin/sh", ["-c", command], options, callback);
```

  즉 `exec("ls -la | grep foo")`는 실제로는 `/bin/sh -c "ls -la | grep foo"`를 실행하는 것과 같다. 그래서 파이프(`|`), 와일드카드(`*`), 환경변수 확장(`$HOME`) 같은 셸 문법이 전부 해석된다.

- `execFile(file, args, ...)` / `execFileSync(file, args, ...)` — 실행 파일과 인자 **배열**을 따로 받아 셸을 거치지 않고 바로 그 파일을 실행한다.

```js
// src/cleanup-detect.js:41-46
const out = execFileSync(
  "gh",
  ["issue", "list", "--state", "open", "--json", "number,title", "--limit", "50"],
  { encoding: "utf-8" },
);
```

  여기서 `gh`는 셸 문법 해석 없이 그대로 실행되고, `--json`, `number,title` 같은 인자도 배열의 원소로 프로세스에 바로 전달된다.

### 셸을 거치지 않는 것이 왜 중요한가 — 셸 인젝션

`exec()`는 문자열을 셸이 다시 파싱하기 때문에, 그 문자열에 사용자가 통제할 수 없는 값(예: 외부에서 가져온 제목)이 섞여 있으면 셸 메타문자(`;`, `` ` ``, `$()`, `&&`)로 임의 명령이 실행될 수 있다. `cleanup-detect.js`는 `buildIssueBody()`(23-38줄)에서 Notion 글 제목을 그대로 이슈 본문 문자열에 넣는데, 이 문자열이 `execFileSync("gh", ["issue", "edit", ..., "--body", body])`처럼 **배열의 한 원소**로 전달되기 때문에 셸이 그 내용을 재해석할 일이 없다. 같은 걸 `exec()`로 짰다면 문자열을 이어붙여 셸 명령을 만들어야 했을 테고, 그 과정에서 인젝션 위험이 생겼을 것이다.

### 시스템 콜 exec()와의 근본적 차이 — 이미지 교체 vs 새 프로세스 생성

시스템 프로그래밍에서 배우는 `execve()`(그리고 이를 감싼 `execv`, `execvp` 등)는 이름은 같지만 레이어가 완전히 다르다.

- 시스템 콜 `exec()`는 **새 프로세스를 만들지 않는다.** 호출한 프로세스의 코드/데이터/스택을 새 프로그램 이미지로 완전히 갈아치울 뿐이고 PID는 그대로 유지된다.
- 성공하면 **호출한 자리로 돌아오지 않는다.** 제어권이 새 프로그램의 진입점으로 넘어가버리기 때문이다. 실패했을 때만 `-1`을 반환하며 원래 코드로 돌아온다.
- 그래서 "원래 프로그램은 살려두고 새 프로그램도 실행"하려면 반드시 `fork()`로 프로세스를 복제한 뒤 자식 쪽에서만 `exec()`를 호출하는 패턴을 쓴다:

```c
// 프로젝트 코드 아님 — fork() + exec() 고전 패턴의 최소 재현
pid_t pid = fork();
if (pid == 0) {
    execvp("gh", args);   // 성공하면 이 지점 이후로 절대 돌아오지 않음
    _exit(127);           // exec가 실패했을 때만 도달
} else {
    int status;
    waitpid(pid, &status, 0);   // 부모는 자식 종료를 동기적으로 기다림
}
```

Node의 `execFileSync("gh", [...])`는 이 `fork()` + `exec()` + `waitpid()` 전체 흐름을 한 함수 호출로 감싸놓은 것이다. 다만 **완전히 새로운 프로세스(새 PID)** 를 만들어서 그 프로세스가 끝날 때까지 기다린 뒤 Node 코드로 돌아온다는 점에서, "자기 자신을 바꿔치기"하는 시스템 콜 `exec()`와는 관찰되는 동작이 정반대다.

### Node의 execFileSync는 C/C++ 레벨에서 어떻게 구현되는가

Node 내부 구조를 따라가면 대략 이렇다 (일반 지식, 프로젝트 코드 아님):

1. `execFileSync`는 내부적으로 동기 버전의 공통 구현인 `spawnSync`를 호출한다.
2. `spawnSync`는 JS가 아니라 Node의 C++ 바인딩(`src/spawn_sync.cc`)으로 넘어간다. 여기서 핵심은, 평소 Node의 비동기 I/O를 돌리는 **메인 libuv 이벤트 루프를 쓰지 않고, 이 호출 하나만을 위한 별도의 임시 `uv_loop_t`를 만들어 `uv_run()`으로 끝까지 돌린다**는 점이다. 그 루프가 끝나야 C++ 함수가 리턴하고, 그래야 JS 실행이 재개된다 — 이게 바로 "동기(blocking)"의 정체다. 이 임시 루프가 도는 동안 메인 이벤트 루프는 멈춰 있으므로 다른 비동기 콜백, 타이머, I/O가 전혀 처리되지 않는다.
3. 그 임시 루프 안에서 `uv_spawn()`이 호출되는데, POSIX에서는 플랫폼/libuv 버전에 따라 `posix_spawn()`(가능하면 이쪽을 우선 사용 — `fork()`의 전체 메모리 복사 비용을 피할 수 있어 더 빠르다) 또는 고전적인 `fork()` + `execve()` 조합으로 자식 프로세스를 만든다.
4. 자식의 stdin/stdout/stderr는 `pipe(2)`로 파이프를 만들고 자식 쪽에서 `dup2(2)`로 표준 입출력에 연결한 뒤 `execve()`로 새 프로그램 이미지를 덮어씌운다. 부모(Node)는 그 파이프에서 데이터를 다 읽고 `SIGCHLD`/`waitpid` 계열 메커니즘으로 자식 종료를 감지할 때까지 임시 루프를 계속 돌린다.
5. 자식이 끝나면 모아둔 stdout 버퍼(`{ encoding: "utf-8" }` 옵션대로 문자열로 디코딩)를 C++ → JS 경계를 넘겨 `execFileSync`의 반환값으로 돌려주고, 종료 코드가 0이 아니면 에러를 던진다.

정리하면: 시스템 프로그래밍의 `fork()+exec()+wait()` 3단 콤보를, Node는 libuv의 `uv_spawn`(내부적으로 `posix_spawn`/`fork+execve`)으로 자동화하고, **동기 버전에 한해서만** 그 위에 "별도 이벤트 루프를 즉석에서 만들어 끝까지 돌린다"는 트릭으로 블로킹 호출처럼 보이게 만든 것이다.
