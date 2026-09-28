import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { googleLogin, login } from '../api/auth'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function GoogleSignInButton({ onCredential }) {
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return

    let cancelled = false
    const render = () => {
      if (cancelled || !window.google || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
      })
    }

    if (window.google) {
      render()
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval)
          render()
        }
      }, 100)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }
    return () => {
      cancelled = true
    }
  }, [onCredential])

  if (!GOOGLE_CLIENT_ID) return null
  return <div ref={buttonRef} className="mb-4 flex justify-center" />
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user)
    },
  })

  const googleMutation = useMutation({
    mutationFn: (credential) => googleLogin(credential),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user)
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="w-full max-w-sm rounded-xl bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,.06),0_4px_14px_rgba(0,0,0,.06)]"
      >
        <h1 className="mb-1 text-xl font-bold text-primary">Fleet Maintenance</h1>
        <div className="mb-6 text-[11px] tracking-wide text-off uppercase">
          Achieve Cafe Provisions
        </div>

        <GoogleSignInButton onCredential={(credential) => googleMutation.mutate(credential)} />
        {googleMutation.isError && (
          <div className="mb-3 text-xs font-semibold text-due">
            {googleMutation.error?.response?.data?.detail ?? 'Google sign-in failed.'}
          </div>
        )}
        {GOOGLE_CLIENT_ID && (
          <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-wide text-off">
            <div className="h-px flex-1 bg-line" />
            or
            <div className="h-px flex-1 bg-line" />
          </div>
        )}

        <div className="mb-3 flex flex-col gap-1">
          <label className="text-xs font-semibold text-off">Email</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          />
        </div>
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs font-semibold text-off">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-white px-2.5 py-2 pr-14 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute inset-y-0 right-2 text-xs font-semibold text-off hover:text-primary"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {mutation.isError && (
          <div className="mb-3 text-xs font-semibold text-due">Invalid email or password.</div>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
