import React, { useState, useRef, useEffect } from 'react'
import { getNumericControl, numericControlKey, numericControlValue } from './numericControl'

/**
 * Dynamic Parameter Inspector for Procedural Mode
 * Renders controls from a dynamically generated schema
 */
export default function DynamicParameterInspector({ schema, params, onParamsChange }) {
  // If no schema, show placeholder
  if (!schema || Object.keys(schema).length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        No parameters available
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          Procedural Parameters
        </span>
        <span className="text-xs text-purple-400">
          {Object.keys(schema).length} controls
        </span>
      </div>
      
      <div className="space-y-2">
        {Object.entries(schema).map(([key, definition]) => (
          <ParameterControl
            key={key}
            name={key}
            definition={definition}
            value={params[key]}
            onChange={(newValue) => {
              onParamsChange({ [key]: newValue })
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Number slider with clickable value for keyboard input
 * Click on the number to type a precise value
 */
function NumberSlider({ name, definition, displayLabel, description, value, onChange }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)
  const editButtonRef = useRef(null)
  const finishedEditing = useRef(false)
  const returnFocus = useRef(false)
  const control = getNumericControl(definition, name)
  const { min: minVal, max: maxVal, step, integer } = control
  // Continuous and off-grid saved values must not be silently rounded by the browser.
  const aligned = Math.abs((value - minVal) / step - Math.round((value - minVal) / step)) < 1e-8
  const rangeStep = integer && aligned ? step : 'any'
  
  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    } else if (returnFocus.current) {
      returnFocus.current = false
      editButtonRef.current?.focus()
    }
  }, [isEditing])
  
  const handleValueClick = () => {
    finishedEditing.current = false
    setEditValue(typeof value === 'number' ? value.toString() : String(value))
    setIsEditing(true)
  }
  
  const handleInputChange = (e) => {
    setEditValue(e.target.value)
  }
  
  const handleInputBlur = () => {
    applyValue()
  }
  
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      returnFocus.current = true
      applyValue()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finishedEditing.current = true
      returnFocus.current = true
      setIsEditing(false)
    }
  }
  
  const applyValue = () => {
    if (finishedEditing.current) return
    finishedEditing.current = true
    const next = numericControlValue(editValue, control)
    if (next !== null && next !== value) onChange(next)
    setIsEditing(false)
  }
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <label className="text-gray-400" title={description}>
          {displayLabel}
        </label>
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            aria-label={`Edit ${displayLabel} value`}
            min={minVal}
            max={maxVal}
            step="any"
            value={editValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-16 px-1 py-0.5 text-right text-purple-400 bg-gray-800 border border-purple-500 rounded text-xs outline-none"
          />
        ) : (
          <button
            type="button"
            ref={editButtonRef}
            aria-label={`Edit ${displayLabel} value`}
            className="text-purple-400 cursor-pointer hover:text-purple-300 hover:underline"
            onClick={handleValueClick}
            title="Click to edit value"
          >
            {value}
          </button>
        )}
      </div>
      <input
        type="range"
        aria-label={displayLabel}
        min={minVal}
        max={maxVal}
        step={rangeStep}
        value={value}
        disabled={minVal === maxVal}
        onChange={(e) => {
          const next = numericControlValue(e.target.value, control, true)
          if (next !== null && next !== value) onChange(next)
        }}
        onKeyDown={e => {
          const next = numericControlKey(value, e.key, control)
          if (next === null) return
          e.preventDefault()
          if (next !== value) onChange(next)
        }}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
      />
    </div>
  )
}

function ParameterControl({ name, definition, value, onChange }) {
  const { type, options, label, description } = definition
  const displayLabel = label || name.replace(/([A-Z])/g, ' $1').trim()
  const currentValue = value ?? definition.default

  switch (type) {
    case 'integer':
    case 'number':
      return (
        <NumberSlider
          displayLabel={displayLabel}
          description={description}
          name={name}
          definition={definition}
          value={currentValue}
          onChange={onChange}
        />
      )

    case 'color':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400" title={description}>
            {displayLabel}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentValue || '#ffffff'}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-8 rounded border border-gray-600 cursor-pointer"
            />
            <span className="text-xs text-gray-500 font-mono">{currentValue}</span>
          </div>
        </div>
      )

    case 'colors':
      return (
        <div className="space-y-1">
          <label className="text-xs text-gray-400" title={description}>
            {displayLabel}
          </label>
          <div className="flex gap-1 flex-wrap">
            {(currentValue || []).map((color, i) => (
              <input
                key={i}
                type="color"
                value={color}
                onChange={(e) => {
                  const newColors = [...currentValue]
                  newColors[i] = e.target.value
                  onChange(newColors)
                }}
                className="w-6 h-6 rounded border border-gray-600 cursor-pointer"
              />
            ))}
            {/* Add color button */}
            <button
              onClick={() => onChange([...(currentValue || []), '#ffffff'])}
              className="w-6 h-6 rounded border border-dashed border-gray-600 text-gray-500 hover:border-purple-500 hover:text-purple-400 text-xs"
              title="Add color"
            >
              +
            </button>
          </div>
        </div>
      )

    case 'select':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400" title={description}>
            {displayLabel}
          </label>
          <select
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-purple-500 outline-none"
          >
            {(options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400" title={description}>
            {displayLabel}
          </label>
          <button
            onClick={() => onChange(!currentValue)}
            className={`w-10 h-5 rounded-full transition-colors ${
              currentValue ? 'bg-purple-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                currentValue ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )

    default:
      // For unknown types, show as text input
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400" title={description}>
            {displayLabel}
          </label>
          <input
            type="text"
            value={String(currentValue)}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 w-24 focus:border-purple-500 outline-none"
          />
        </div>
      )
  }
}

/**
 * Extract default params from a schema
 */
export function extractDefaultParams(schema) {
  const params = {}
  if (schema) {
    for (const [key, def] of Object.entries(schema)) {
      if (def.default !== undefined) {
        params[key] = def.default
      }
    }
  }
  return params
}

/**
 * Check if an asset has meaningful animation
 * by looking for non-empty update function patterns
 */
export function hasAnimation(code) {
  if (!code) return false
  
  // Look for patterns that indicate actual animation logic
  const animationPatterns = [
    /\.rotation\.\w+\s*[+\-*/]=?\s*(?:time|delta)/i,
    /\.position\.\w+\s*=.*(?:Math\.sin|Math\.cos|time|delta)/i,
    /\.scale\.set\s*\(.*(?:Math\.sin|Math\.cos|time|delta)/i,
    /instanceMatrix\.needsUpdate\s*=\s*true/i,
    /setMatrixAt\s*\(/i,
    /uniforms\.\w+\.value\s*=/i,
    /update\s*[=:]\s*\(\s*(?:time|t)\s*(?:,\s*(?:delta|dt))?\s*\)\s*=>\s*\{[^}]+[^\s]/i,
    /userData\.tick\s*=/i,
  ]
  
  return animationPatterns.some(pattern => pattern.test(code))
}
