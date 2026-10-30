# Pi-UI TODO：對齊 pi coding agent 功能

對照來源：`reference/pi/packages/coding-agent/src/core/slash-commands.ts` 與 `src/modes/rpc/rpc-types.ts`。

## 進行中

- [ ] `/thinking`：輸入框左下角的模型選擇器，可切換模型設定檔（只列出目前環境已勾選啟用的）與思考強度（依模型支援的等級）

## 部分完成

- [ ] `/settings`：目前只有模型設定，缺 steering / follow-up mode、auto-compaction、auto-retry 等設定
- [ ] `/login`：只支援 API Key，OAuth 供應商（github-copilot、openai-codex、radius）尚未支援
- [ ] `/tree`：已有分支切換與回溯，缺完整的 session 樹狀瀏覽 UI

## 尚未實作

- [ ] `/compact`：手動壓縮上下文（RPC `compact`）
- [ ] steer / follow-up：agent 執行中插話或排隊訊息、清空佇列（RPC `steer`、`follow_up`、`clear_queue`）
- [ ] slash 指令自動完成選單，含 extension / skill / prompt template 的自訂指令（RPC `get_commands`）
- [ ] `/session`：顯示 session 資訊與 token / 費用統計（RPC `get_session_stats`）
- [ ] `/scoped-models`：設定 Ctrl+P 輪換的模型清單（RPC `cycle_model`）
- [ ] `/import`：從 JSONL 匯入並接續對話
- [ ] `/share`：分享為 gist / artifact
- [ ] `/logout`
- [ ] `/reload`：重新載入 extensions、skills、prompts、themes、context 檔
- [ ] `/trust`：儲存專案信任決定
- [ ] auto-compaction / auto-retry 開關與中斷重試（RPC `set_auto_compaction`、`set_auto_retry`、`abort_retry`）
- [ ] RPC 模式直接執行 bash（`bash`、`abort_bash`）
- [ ] extension 互動 UI（`extension_ui_request` / `extension_ui_response`）
- [ ] `/hotkeys`、`/changelog`、`/bug`（次要）

## 已完成

- [x] `/new`、`/resume`、`/model`、`/name`、`/fork`、`/clone`、`/export`、`/copy`
