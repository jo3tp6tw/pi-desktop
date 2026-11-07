import type { SshConfig } from '../types';

// 執行 pi 的環境：本機或某台 SSH 主機。每個環境有自己的 ~/.pi/agent 模型設定。
export interface PiEnvironment {
  key: string;
  label: string;
  ssh: SshConfig | null;
}

export const LOCAL_ENV: PiEnvironment = { key: 'local', label: 'Local', ssh: null };

// 與 electron/main.cjs 的 envKeyOf 一致（SshConfig.id 已在儲存時正規化）
export const envKeyOf = (ssh?: SshConfig | null): string => (ssh ? `ssh:${ssh.id}` : 'local');

export const envOf = (ssh?: SshConfig | null): PiEnvironment =>
  ssh ? { key: envKeyOf(ssh), label: ssh.label || ssh.host, ssh } : LOCAL_ENV;
