# IPC Channel Verification Report (P17)

## Summary

| Metric | Old | New |
|--------|-----|-----|
| IPC Channels | 20 | 31 |
| Exposed Keys | 20 | 31 |
| IPC Handler Files | - | 6 |
| Handler Channels | - | 29 |

## Orphan Channels (in preload but no handler) (3)

- app:closeChoice
- app:finalSave
- app:requestClose

## Old Architecture Exposed Keys

- decrypt
- diagClear
- diagExport
- diagRead
- diagWrite
- dialogOpenFile
- dialogSaveFile
- encrypt
- fetchModels
- forceQuit
- onCloseRequest
- onFinalSave
- respondCloseChoice
- storageExport
- storageGetDataDir
- storageImport
- storageList
- storageRead
- storageRemove
- storageWrite

## New Architecture Exposed Keys

- agentCancel
- agentExecute
- agentSpawn
- agentStatus
- deaiCancel
- deaiProcess
- decrypt
- diagClear
- diagExport
- diagRead
- diagWrite
- dialogOpenFile
- dialogSaveFile
- encrypt
- fetchModels
- forceQuit
- onCloseRequest
- onFinalSave
- pipelineGenerate
- pipelineResume
- providerTestConnection
- respondCloseChoice
- skillExecute
- skillValidate
- storageExport
- storageGetDataDir
- storageImport
- storageList
- storageRead
- storageRemove
- storageWrite

## IPC Handler Channels

- agent:cancel
- agent:execute
- agent:spawn
- agent:status
- api:fetchModels
- app:getVersion
- app:quit
- deai:cancel
- deai:process
- diag:clear
- diag:export
- diag:read
- diag:write
- dialog:openFile
- dialog:saveFile
- pipeline:generate
- pipeline:resume
- provider:testConnection
- safe:decrypt
- safe:encrypt
- skill:execute
- skill:validate
- storage:export
- storage:getDataDir
- storage:import
- storage:list
- storage:read
- storage:remove
- storage:write
