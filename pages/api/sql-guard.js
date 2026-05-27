const BLOCKED_SQL = /\b(alter|call|comment|copy|create|delete|do|drop|execute|grant|insert|listen|merge|notify|refresh|reindex|revoke|set|truncate|unlisten|update|vacuum)\b/i

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
}

export function validateReadOnlySql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('Порожній SQL запит')
  }

  const cleaned = stripSqlComments(sql).replace(/;\s*$/, '').trim()

  if (!/^(select|with)\b/i.test(cleaned)) {
    throw new Error('Дозволені тільки SELECT запити')
  }

  if (cleaned.includes(';')) {
    throw new Error('Дозволений тільки один SQL запит')
  }

  if (BLOCKED_SQL.test(cleaned)) {
    throw new Error('SQL містить недозволену операцію')
  }

  return cleaned
}
