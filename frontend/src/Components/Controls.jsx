
export default function Controls({ diffusion, setDiffusion, onDiffuse }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {/* Steps */}
      <div className="flex flex-col items-center w-64">
        <label className="text-sm font-medium text-gray-700 mb-1">
          Steps: {diffusion.steps}
        </label>
        <input
          type="range"
          min="1"
          max="1000"
          value={diffusion.steps}
          onChange={(e) =>
            setDiffusion((p) => ({ ...p, steps: e.target.value }))
          }
          className="w-full accent-black"
        />
      </div>

      {/* Beta Min */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Beta Min</label>
        <input
          type="number"
          value={diffusion.betaMin}
          onChange={(e) =>
            setDiffusion((p) => ({ ...p, betaMin: e.target.value }))
          }
          className="border border-gray-300 rounded px-2 py-1 w-24 text-center"
        />
      </div>

      {/* Beta Max */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Beta Max</label>
        <input
          type="number"
          value={diffusion.betaMax}
          onChange={(e) =>
            setDiffusion((p) => ({ ...p, betaMax: e.target.value }))
          }
          className="border border-gray-300 rounded px-2 py-1 w-24 text-center"
        />
      </div>

      {/* Schedule (future-ready) */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Schedule</label>
        <select
          value={diffusion.schedule}
          onChange={(e) =>
            setDiffusion((p) => ({ ...p, schedule: e.target.value }))
          }
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="linear">Linear</option>
          <option value="cosine">Cosine</option>
        </select>
      </div>

      {/* Diffuse button */}
      <button
        onClick={onDiffuse}
        className="bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-semibold"
      >
        Diffuse
      </button>
    </div>
  );
}
