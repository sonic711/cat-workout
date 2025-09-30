declare module 'sql.js' {
  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string
  }

  export interface Statement {
    bind(params?: Record<string, unknown> | unknown[]): void
    step(): boolean
    getAsObject<T extends Record<string, unknown>>(): T
    reset(): void
    free(): void
  }

  export interface Database {
    exec(sql: string): void
    prepare(sql: string): Statement
    export(): Uint8Array
  }

  export interface SqlJsStatic {
    Database: {
      new (data?: Uint8Array): Database
    }
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>
}
