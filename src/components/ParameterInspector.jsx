import React from 'react'
import { getGeneratorSchema } from '../schemas/assetSpec'

export default function ParameterInspector({ spec, onParamsChange }) {
  // If no spec, show placeholder
  if (!spec) {
    return (
      <div className="text-gray-500 text-sm">
        Generate an asset to adjust its parameters
      </div>
    )
  }

  const schema = getGeneratorSchema(spec.generator)
  
  if (!schema) {
    return (
      <div className="text-gray-500 text-sm">
        No parameters available for this generator
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {schema.name}
        </span>
        <span className="text-xs text-gray-600">
          Seed: {spec.seed}
        </span>
      </div>
      
      <div className="space-y-2">
        {Object.entries(schema.params).map(([key, def]) => (
          <ParameterControl
            key={key}
            name={key}
            definition={def}
            value={key.split('.').reduce((value, part) => value?.[part], spec.params)}
            onChange={(newValue) => {
              const [parent, child] = key.split('.')
              onParamsChange(child
                ? { [parent]: { ...spec.params[parent], [child]: newValue } }
                : { [key]: newValue })
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ParameterControl({ name, definition, value, onChange }) {
  const { type, min, max, options, description } = definition

  switch (type) {
    case 'number':
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <label className="text-gray-400 capitalize">{name.replace(/([A-Z])/g, ' $1')}</label>
            <span className="text-helios-400">{typeof value === 'number' ? (definition.step === 1 ? value : value.toFixed(2)) : value}</span>
          </div>
          <input
            type="range"
            aria-label={name}
            min={min}
            max={max}
            step={definition.step ?? (max - min) / 100}
            value={value ?? definition.default}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-helios-500"
          />
        </div>
      )

    case 'color':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 capitalize">{name.replace(/([A-Z])/g, ' $1')}</label>
          <input
            type="color"
            aria-label={name}
            value={value ?? definition.default}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded border border-gray-600 cursor-pointer"
          />
        </div>
      )

    case 'colors':
      return (
        <div className="space-y-1">
          <label className="text-xs text-gray-400 capitalize">{name.replace(/([A-Z])/g, ' $1')}</label>
          <div className="flex gap-1 flex-wrap">
            {(value || definition.default || []).map((color, i) => (
              <input
                key={i}
                type="color"
                aria-label={`${name} ${i + 1}`}
                value={color}
                onChange={(e) => {
                  const newColors = [...(value || definition.default)]
                  newColors[i] = e.target.value
                  onChange(newColors)
                }}
                className="w-6 h-6 rounded border border-gray-600 cursor-pointer"
              />
            ))}
          </div>
        </div>
      )

    case 'select':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 capitalize">{name.replace(/([A-Z])/g, ' $1')}</label>
          <select
            aria-label={name}
            value={value ?? definition.default}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 capitalize">{name.replace(/([A-Z])/g, ' $1')}</label>
          <button
            type="button"
            role="switch"
            aria-label={name}
            aria-checked={!!value}
            onClick={() => onChange(!value)}
            className={`w-10 h-5 rounded-full transition-colors ${
              value ? 'bg-helios-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                value ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )

    default:
      return null
  }
}
