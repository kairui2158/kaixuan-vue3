export interface DiffChange {
  type: 'unchanged' | 'added' | 'removed'
  text: string
}

export declare function lcsDiff(a: string, b: string): DiffChange[]
