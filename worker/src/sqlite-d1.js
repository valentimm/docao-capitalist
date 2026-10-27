// Adapter só para testes e para o servidor local.
// O Worker de produção usa o binding D1 de verdade e não importa este arquivo.

export function createSqliteD1(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() {
              return statement.get(...params) ?? null;
            },
            async all() {
              return { results: statement.all(...params) };
            },
            async run() {
              const info = statement.run(...params);
              return { success: true, meta: { changes: info.changes } };
            },
          };
        },
      };
    },
  };
}
