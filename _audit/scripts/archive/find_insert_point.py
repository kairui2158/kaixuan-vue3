with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if "pl-content-right" in line:
            print(f"pl-content-right: line {i+1}")
        if "pipelineStore.currentStep === 0" in line and "v-show" in line:
            print(f"step 0 panel: line {i+1}")
        if "pipelineStore.currentStep === 4" in line and "v-show" in line:
            print(f"step 4 panel: line {i+1}")
        if "pl-result" in line and "bodyResult" in line:
            print(f"body result: line {i+1}")
        if "insert-body" in line or "insertBody" in line:
            print(f"insert body: line {i+1}")
        if "ExecutionLogPanel" in line:
            print(f"exec log: line {i+1}")
        if "pl-content-right" in line:
            # find the closing div for pl-content-right
            for j in range(i, len(lines)):
                if "</div>" in lines[j] and lines[j].strip() == "</div>":
                    # check if this closes the pl-content-right
                    indent = len(lines[j]) - len(lines[j].lstrip())
                    if indent == 8:
                        print(f"closing pl-content-right div: line {j+1} (indent {indent})")
                        break
            break
