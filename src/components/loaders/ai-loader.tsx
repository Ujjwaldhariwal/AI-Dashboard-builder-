'use client'

import { useEffect, useRef, useState } from 'react'

const PHASES = [
  { label: 'Initialising system', code: 'SYS_INIT', end: 18 },
  { label: 'Loading data modules', code: 'MOD_LOAD', end: 38 },
  { label: 'Building widget registry', code: 'REG_BUILD', end: 58 },
  { label: 'Configuring layout engine', code: 'LAYOUT_CFG', end: 78 },
  { label: 'Finalising workspace', code: 'WS_FINAL', end: 100 },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function getPhase(progress: number) {
  for (let i = 0; i < PHASES.length; i += 1) {
    if (progress <= PHASES[i].end) return i
  }
  return PHASES.length - 1
}

interface AILoaderProps {
  onComplete?: () => void
}

export default function AILoader({ onComplete }: AILoaderProps) {
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  const done = progress >= 100
  const phase = getPhase(progress)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (done) {
      onComplete?.()
      return
    }

    const speed = progress < 50 ? 55 : progress < 80 ? 80 : 120
    const timer = window.setTimeout(() => {
      setProgress((value) => Math.min(value + 1, 100))
    }, speed)

    return () => window.clearTimeout(timer)
  }, [progress, done, onComplete])

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.12)',
        borderRadius: 12,
        padding: '40px 44px 36px',
        maxWidth: 520,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 36,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.14em',
              color: '#999',
              marginBottom: 6,
            }}
          >
            AI DASHBOARD BUILDER
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: '#111',
              letterSpacing: '-0.01em',
            }}
          >
            {done ? 'System ready' : PHASES[phase].label}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 22,
              fontWeight: 500,
              color: '#111',
              letterSpacing: '-0.02em',
            }}
          >
            {progress}
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.1em',
              color: '#999',
            }}
          >
            COMPLETE
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          height: 2,
          background: 'rgba(0,0,0,0.08)',
          marginBottom: 32,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progress}%`,
            background: '#111',
            transition: 'width 80ms linear',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -3,
            width: 2,
            height: 8,
            background: '#111',
            left: `calc(${progress}% - 1px)`,
            transition: 'left 80ms linear',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {PHASES.map((phaseItem, index) => {
          const isActive = index === phase && !done
          const isDone = index < phase || done

          return (
            <div
              key={phaseItem.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 0',
                borderBottom: '0.5px solid rgba(0,0,0,0.08)',
                opacity: isDone ? 0.45 : isActive ? 1 : 0.2,
                transition: 'opacity 0.35s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: isActive || isDone ? '#111' : 'transparent',
                    border: `0.5px solid ${isActive || isDone ? '#111' : 'rgba(0,0,0,0.3)'}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 400, color: '#444' }}>
                  {phaseItem.label}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: '#999',
                }}
              >
                {isDone ? 'done' : isActive ? `${phaseItem.code}...` : phaseItem.code}
              </span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: done ? '#3B6D11' : '#999',
            }}
          />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.08em',
              color: done ? '#3B6D11' : '#999',
            }}
          >
            {done ? 'ready' : PHASES[phase].code.toLowerCase().replace('_', ' ')}
          </span>
        </div>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            color: '#999',
          }}
        >
          {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
        </span>
      </div>
    </div>
  )
}