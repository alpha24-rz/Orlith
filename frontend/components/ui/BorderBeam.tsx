'use client'

import React from 'react'

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  borderWidth?: number
  anchor?: number
  delay?: number
  rainbow?: boolean
  glow?: boolean
}

/**
 * BorderBeam Component
 * An animated rainbow glow that rides the border of any card, container, or input.
 */
export function BorderBeam({
  className = '',
  size = 280,
  duration = 8,
  borderWidth = 1.5,
  anchor = 90,
  delay = 0,
  rainbow = true,
  glow = true,
}: BorderBeamProps) {
  const beamGradient = rainbow
    ? 'linear-gradient(to left, #ff0080, #7928ca, #0070f3, #00dfd8, #43e97b, #ffaa40, #ff0080, transparent)'
    : 'linear-gradient(to left, #6366F1, #A855F7, #EC4899, transparent)'

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden z-0">
      {/* Soft chromatic ambient glow */}
      {glow && (
        <div
          style={
            {
              '--size': `${size}px`,
              '--duration': `${duration}s`,
              '--anchor': `${anchor}%`,
              '--delay': `-${delay}s`,
              '--beam-gradient': beamGradient,
            } as React.CSSProperties
          }
          className="border-beam-glow group-focus-within/input:opacity-75 transition-opacity duration-300"
        />
      )}

      {/* Crisp beam riding the border */}
      <div
        style={
          {
            '--size': `${size}px`,
            '--duration': `${duration}s`,
            '--anchor': `${anchor}%`,
            '--border-width': `${borderWidth}px`,
            '--delay': `-${delay}s`,
            '--beam-gradient': beamGradient,
          } as React.CSSProperties
        }
        className={`border-beam-container ${className}`}
      />
    </div>
  )
}

export default BorderBeam
