const HOJE = new Date('2026-08-11T17:00:00-03:00')

const hora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

const diaLongo = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
})

/** "Hoje", "Ontem", "6 de agosto" — como uma pessoa fala, não ISO. */
export function diaRelativo(iso: string): string {
  const d = new Date(iso)
  const dias = Math.floor(
    (dataPura(HOJE).getTime() - dataPura(d).getTime()) / 86_400_000,
  )
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  if (dias < 7) return `${dias} dias atrás`
  return diaLongo.format(d)
}

export function horaDe(iso: string): string {
  return hora.format(new Date(iso))
}

function dataPura(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`
}
