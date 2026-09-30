import { useEffect, useState } from 'react'

// Tiny hash router: #/vans/29 -> ['vans', '29']. Hash URLs need nothing from
// the Django side, and the browser's Back button and bookmarks just work.
function readPath() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash ? hash.split('/').map(decodeURIComponent) : []
}

export function useRoute() {
  const [path, setPath] = useState(readPath)
  useEffect(() => {
    const onChange = () => {
      setPath(readPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

export function navigate(...parts) {
  window.location.hash = '/' + parts.filter((p) => p !== undefined && p !== '').map(encodeURIComponent).join('/')
}

export function href(...parts) {
  return '#/' + parts.filter((p) => p !== undefined && p !== '').map(encodeURIComponent).join('/')
}
