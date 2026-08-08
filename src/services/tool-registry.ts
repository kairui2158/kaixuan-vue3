/**
 * Tool Registry - registers and manages callable tools for MCP/Agent system
 * Each tool has: name, description, parameters schema, handler function
 */

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  default?: any
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameter[]
  handler: (params: Record<string, any>) => Promise<any>
}

class ToolRegistryClass {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  listNames(): string[] {
    return Array.from(this.tools.keys())
  }

  async execute(name: string, params: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
    // validate required params
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter: ${param.name}`)
      }
      if (!(param.name in params) && param.default !== undefined) {
        params[param.name] = param.default
      }
    }
    return tool.handler(params)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  clear(): void {
    this.tools.clear()
  }
}

export const ToolRegistry = new ToolRegistryClass()

// Register built-in tools
ToolRegistry.register({
  name: 'text.replace',
  description: 'Replace text in a string',
  parameters: [
    { name: 'text', type: 'string', description: 'Input text', required: true },
    { name: 'find', type: 'string', description: 'Text to find', required: true },
    { name: 'replace', type: 'string', description: 'Replacement text', required: true }
  ],
  handler: async (p) => p.text.split(p.find).join(p.replace)
})

ToolRegistry.register({
  name: 'text.wordCount',
  description: 'Count words in text',
  parameters: [
    { name: 'text', type: 'string', description: 'Input text', required: true }
  ],
  handler: async (p) => (p.text || '').length
})

ToolRegistry.register({
  name: 'json.validate',
  description: 'Validate and parse JSON string',
  parameters: [
    { name: 'text', type: 'string', description: 'JSON string to validate', required: true }
  ],
  handler: async (p) => {
    try { return { valid: true, data: JSON.parse(p.text) } }
    catch (e) { return { valid: false, error: (e as Error).message } }
  }
})

ToolRegistry.register({
  name: 'text.split',
  description: 'Split text by separator with semantic boundary awareness',
  parameters: [
    { name: 'text', type: 'string', description: 'Input text', required: true },
    { name: 'size', type: 'number', description: 'Target chunk size in chars', required: true, default: 1000 },
    { name: 'overflow', type: 'number', description: 'Max overflow for semantic boundary', required: false, default: 200 }
  ],
  handler: async (p) => {
    const segments: string[] = []
    let pos = 0
    while (pos < p.text.length) {
      let end = pos + p.size
      if (end >= p.text.length) {
        segments.push(p.text.slice(pos))
        break
      }
      // look for paragraph break within overflow range
      let breakPoint = -1
      for (let i = end; i < Math.min(end + p.overflow, p.text.length); i++) {
        if (p.text[i] === '\n' && p.text[i + 1] === '\n') {
          breakPoint = i + 2
          break
        }
      }
      // fallback to sentence break
      if (breakPoint < 0) {
        for (let i = end; i < Math.min(end + p.overflow, p.text.length); i++) {
          if (p.text[i] === '.' || p.text[i] === '!' || p.text[i] === '?') {
            breakPoint = i + 1
            break
          }
        }
      }
      // fallback to hard cut
      if (breakPoint < 0) breakPoint = end
      segments.push(p.text.slice(pos, breakPoint))
      pos = breakPoint
    }
    return { segments, count: segments.length }
  }
})
