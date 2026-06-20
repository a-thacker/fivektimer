// Format milliseconds as H:MM:SS or MM:SS
export function formatDuration(ms) {
  if (ms == null || ms < 0) return '--:--'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Diff two ISO timestamp strings -> ms
export function diffMs(start, end) {
  if (!start || !end) return null
  return new Date(end) - new Date(start)
}

export function teamColorStyle(color) {
  if (!color) return {}
  return {
    background: color,
    color: isLight(color) ? '#111' : '#fff',
    padding: '2px 10px',
    borderRadius: '999px',
    fontWeight: 700,
    fontSize: '0.85rem',
    display: 'inline-block',
  }
}

function isLight(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

export const TEAM_COLORS = [
  { label: 'Red',    value: '#e53e3e' },
  { label: 'Blue',   value: '#3182ce' },
  { label: 'Green',  value: '#38a169' },
  { label: 'Yellow', value: '#d69e2e' },
  { label: 'Purple', value: '#805ad5' },
  { label: 'Orange', value: '#dd6b20' },
  { label: 'Pink',   value: '#d53f8c' },
  { label: 'Teal',   value: '#319795' },
  { label: 'Black',  value: '#1a202c' },
  { label: 'White',  value: '#e2e8f0' },
]

export const AGE_GROUPS = [
  '14 & Under', '15-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70+',
]

export function calcAgeGroup(age) {
  if (age == null) return null
  if (age <= 14) return '14 & Under'
  if (age <= 19) return '15-19'
  if (age <= 29) return '20-29'
  if (age <= 39) return '30-39'
  if (age <= 49) return '40-49'
  if (age <= 59) return '50-59'
  if (age <= 69) return '60-69'
  return '70+'
}

// Derive status for a runner given their timing record + whether race started
export function runnerStatus(rec, raceStarted) {
  if (!raceStarted) return 'Waiting for Start'
  if (!rec) return 'Running'
  if (rec.dnf) return 'DNF'
  if (rec.finish_time) return 'Finished'
  return 'Running'
}
