import { defineStore } from "pinia";
import { ref } from "vue";

export interface ExecLogEntry {
  id: string;
  timestamp: number;
  step: number;
  stepName: string;
  mode: string;
  skillNames: string[];
  prompt: string;
  result: string;
  duration: number;
  status: "success" | "failed";
  feedback?: "up" | "down";
}

export const useExecutionLogStore = defineStore("executionLog", () => {
  const logs = ref<ExecLogEntry[]>([]);
  const maxLogs = 200;

  function addLog(entry: Omit<ExecLogEntry, "id" | "timestamp">) {
    const log: ExecLogEntry = {
      id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      ...entry,
    };
    logs.value.unshift(log);
    if (logs.value.length > maxLogs) {
      logs.value = logs.value.slice(0, maxLogs);
    }
  }

  function setFeedback(logId: string, fb: "up" | "down") {
    const found = logs.value.find((l) => l.id === logId);
    if (found) {
      found.feedback = found.feedback === fb ? undefined : fb;
    }
  }

  function removeLog(id: string) { const idx = logs.value.findIndex((l) => l.id === id); if (idx >= 0) logs.value.splice(idx, 1); }

  function clearLogs() {
    logs.value = [];
  }

  function getStats() {
    const total = logs.value.length;
    const success = logs.value.filter((l) => l.status === "success").length;
    const failed = total - success;
    const avgDuration =
      total > 0
        ? Math.round(
            logs.value.reduce((s, l) => s + l.duration, 0) / total
          )
        : 0;
    const modeCounts: Record<string, number> = {};
    logs.value.forEach((l) => {
      modeCounts[l.mode] = (modeCounts[l.mode] || 0) + 1;
    });
    return { total, success, failed, avgDuration, modeCounts };
  }

  function getSuggestions(): string[] {
    const suggestions: string[] = [];
    const failedLogs = logs.value.filter((l) => l.status === "failed");
    if (failedLogs.length > 0) {
      suggestions.push(
        `有 ${failedLogs.length} 次执行失败，建议检查API配置或Skill模板格式。`
      );
    }
    const slowLogs = logs.value.filter((l) => l.duration > 30000);
    if (slowLogs.length > 0) {
      suggestions.push(
        `有 ${slowLogs.length} 次执行超过30秒，建议考虑使用 compose 模式减少API调用次数。`
      );
    }
    const downFeedback = logs.value.filter((l) => l.feedback === "down");
    if (downFeedback.length > 0) {
      suggestions.push(
        `有 ${downFeedback.length} 次执行收到负面反馈，建议检查该步骤的Skill配置。`
      );
    }
    const modeUsage = logs.value.reduce((acc, l) => {
      acc[l.mode] = (acc[l.mode] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const unusedModes = ["chain", "split-merge", "multi-step", "compose"].filter(
      (m) => !modeUsage[m]
    );
    if (unusedModes.length > 0) {
      suggestions.push(
        `未使用模式：${unusedModes.join("、")}。尝试切换模式可能获得更好的生成效果。`
      );
    }
    if (suggestions.length === 0) {
      suggestions.push("当前执行状态良好，无优化建议。");
    }
    return suggestions;
  }

  return {
    logs,
    addLog,
    setFeedback,
    clearLogs,
    getStats,
    getSuggestions,
  };
});
