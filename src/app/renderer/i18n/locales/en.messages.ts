export const enMessages = {
  agentLaunchFailed: 'Agent launch failed: {{message}}',
  agentResumeFailed: 'Agent resume failed: {{message}}',
  agentRestoreSessionMissing:
    'FreeCli could not resolve a resumable session for this agent during restore.',
  terminalLaunchFailed: 'Terminal launch failed: {{message}}',
  hostedTerminalResumeUnavailable:
    'FreeCli could not resolve a resumable Codex/Claude terminal session during restore.',
  hostedTerminalResumeFailed: 'Terminal session resume failed: {{message}}',
  fallbackTerminalFailed: 'Fallback terminal launch also failed: {{message}}',
  agentPromptRequired: 'Agent prompt cannot be empty.',
  taskRequirementRequired: 'Task requirement cannot be empty.',
  taskTitleGenerateFailed: 'Auto-generation failed: {{message}}',
  taskCreateFailed: 'Failed to create task: {{message}}',
  taskUpdateFailed: 'Failed to update task: {{message}}',
  taskNodePlacementFailed: 'Task node cannot be placed. Tidy the canvas and try again.',
  taskTitleOrAutoGenerateRequired: 'Enter a task title or enable auto-generation.',
  taskTitleRequired: 'Enter a task title.',
  taskPromptTemplateNameRequired: 'Template name cannot be empty.',
  taskPromptTemplateContentRequired: 'Template content cannot be empty.',
  taskPromptTemplateNameTaken: 'A template with this name already exists.',
  taskPromptTemplateProjectUnavailable: 'Project templates are unavailable.',
  taskLinkedAgentWindowOpen: 'Close the currently linked agent window before continuing.',
  taskResumeSessionMissing:
    'This agent record does not have a verified resumeSessionId, so it cannot resume.',
  resumeSessionMissing: 'This agent does not have a verified resumeSessionId yet.',
  noTerminalSlotNearby:
    'No room nearby in the current view. Move or close some terminal windows first.',
  noWindowSlotOnRight:
    'No room to the right of the current agent. Move or close some windows first.',
  noWindowSlotNearby: 'No room nearby in the current view. Move or close some windows first.',
  arrangeAllSkippedSpaces_one: 'Skipped {{count}} space: not enough room to arrange.',
  arrangeAllSkippedSpaces_other: 'Skipped {{count}} spaces: not enough room to arrange.',
  arrangeSpaceNoRoom: 'Not enough room to arrange this space. Resize the space and try again.',
  noteToTaskRequiresContent: 'Cannot convert an empty note into a task.',
  agentLastMessageUnavailable:
    'The current agent is unavailable, so the last message cannot be copied.',
  agentLastMessageStartedAtMissing:
    'The current agent is missing its session start time, so the last message cannot be copied.',
  agentLastMessageEmpty: 'The current agent does not have a last message to copy yet.',
  agentLastMessageCopied: 'The last agent message was copied.',
  agentLastMessageCopyFailed: 'Failed to copy the last agent message: {{message}}',
  agentSpaceDirectoryMismatch:
    'Agent windows cannot enter or leave a space with a different directory.',
  terminalSpaceDirectoryMismatch:
    'Terminal windows cannot enter or leave a space with a different directory.',
  taskSpaceMoveBlocked: 'Tasks with active agents cannot be moved between spaces.',
  spaceRequiresNode: 'Space must include at least one task or agent.',
  terminalClipboardImageUnavailable:
    'No clipboard image was available to turn into a temporary file. Try copying the image again.',
  terminalClipboardImageMaterializeFailed:
    'Failed to create a temporary file from the clipboard image: {{message}}',
  terminalDropPathUnavailable:
    'Unable to resolve a local path from the dropped item. Use copy and paste instead.',
  terminalDropPathResolveFailed: 'Failed to resolve dropped path: {{message}}',
  canvasImageUnsupportedType: 'Unsupported image type. Use PNG, JPEG, WebP, GIF, or AVIF.',
  canvasImageTooLarge: 'Image is too large (max {{maxMb}} MB).',
  canvasImageImportFailed: 'Failed to import image: {{message}}',
} as const
