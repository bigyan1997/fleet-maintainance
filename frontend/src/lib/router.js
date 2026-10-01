import { useEffect, useState } from 'react'

// Tiny router on clean addresses: /vans/29 -> ['vans', '29']. Django sends
// the app for any address that isn't /api, /admin, /static or /report, so
// links, reloads, bookmarks and the Back button all work.

// Addresses the app doesn't handle itself (the server does).
const SERVER_PATHS = /^\/(api|admin|static|report)(\/|$)/

function readPath() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '')
  return path ? path.split('/').map(decodeURIComponent) : []
}

// Old bookmarks used /#/services; move them to /services once, on load.
function upgradeHashLink() {
  const hash = window.location.hash
  if (hash.startsWith('#/')) {
    window.history.replaceState(null, '', '/' + hash.slice(2).replace(/^\/+/, ''))
  }
}

const listeners = new Set()
function notify() {
  for (const fn of listeners) fn()
}

// Plain <a href="/vans"> links switch pages in place instead of reloading.
function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = e.target.closest?.('a[href]')
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return
  const url = new URL(a.href, window.location.href)
  if (url.origin !== window.location.origin || SERVER_PATHS.test(url.pathname)) return
  e.preventDefault()
  if (url.pathname + url.search !== window.location.pathname + window.location.search) {
    window.history.pushState(null, '', url.pathname + url.search)
    notify()
  }
}

let installed = false
function install() {
  if (installed) return
  installed = true
  upgradeHashLink()
  window.addEventListener('popstate', notify)
  document.addEventListener('click', onLinkClick)
}

export function useRoute() {
  install()
  const [path, setPath] = useState(readPath)
  useEffect(() => {
    const onChange = () => {
      setPath(readPath())
      window.scrollTo(0, 0)
    }
    listeners.add(onChange)
    onChange()
    return () => listeners.delete(onChange)
  }, [])
  return path
}

function build(parts) {
  return '/' + parts.filter((p) => p !== undefined && p !== '').map(encodeURIComponent).join('/')
}

export function navigate(...parts) {
  const to = build(parts)
  if (to !== window.location.pathname) {
    window.history.pushState(null, '', to)
    notify()
  }
}

export function href(...parts) {
  return build(parts)
}

// Like navigate, but replaces the current address instead of adding one, so
// Back doesn't bounce off a redirect (e.g. / -> /home).
export function redirect(...parts) {
  window.history.replaceState(null, '', build(parts))
  notify()
}
