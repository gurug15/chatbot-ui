"use client"

import { RefObject, useEffect, useRef, useState, useCallback } from "react"
import { PluginContext } from "molstar/lib/mol-plugin/context"
import { DefaultPluginSpec } from "molstar/lib/mol-plugin/spec"
import { UUID } from "molstar/lib/mol-util"
import { Asset } from "molstar/lib/mol-util/assets"
import { v4 as uuidv4 } from "uuid"
import { Color } from "molstar/lib/mol-util/color"
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects"
import { BuiltInCoordinatesFormat } from "molstar/lib/mol-plugin-state/formats/coordinates"
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms"
import { BuiltInTrajectoryFormat } from "molstar/lib/mol-plugin-state/formats/trajectory"
import { MolScriptBuilder as MS } from "molstar/lib/mol-script/language/builder"
import { StructureElement } from "molstar/lib/mol-model/structure"
import { createStructureRepresentationParams } from "molstar/lib/mol-plugin-state/helpers/structure-representation-params"
import toast from "react-hot-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoadedStructureInfo {
  structureRef: string   // ref to the Structure node — used for color/repr
  modelRef: string       // ref to the Model node
  atomCount: number
  chains: string[]
  filename: string
}

// Everything the chat/agent needs to know about current viewer state
export interface ViewerSnapshot {
  isStructureLoaded: boolean
  filename: string | null
  atomCount: number
  chains: string[]
  representation: string
  structureColor: string
  bgColor: string
  isSpinning: boolean
  isTrajectoryLoaded: boolean
  isStereoEnabled: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useMolstar = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  parentRef: RefObject<HTMLDivElement | null>
) => {

  // Plugin
  const [plugin, setPlugin] = useState<PluginContext | null>(null)
  const [isPluginReady, setIsPluginReady] = useState(false)

  // Structure state
  const [loadedStructure, setLoadedStructure] = useState<LoadedStructureInfo | null>(null)
  const [isTrajectoryLoaded, setIsTrajectoryLoaded] = useState(false)

  // Visual state — kept in sync so getSnapshot() is always accurate
  const [representation, setRepresentation] = useState<string>("default")
  const [structureColor, setStructureColor] = useState<string>("#ffffff")
  const [bgColor, setBgColor] = useState<string>("#000000")
  const [isSpinning, setIsSpinning] = useState(false)
  const [isStereoEnabled, setIsStereoEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  // Representation types available (populated after structure loads)
  const [representationTypes, setRepresentationTypes] = useState<[string, string][]>([])

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const initPlugin = async () => {
      try {
        const canvas = canvasRef.current
        const parent = parentRef.current
        if (!canvas || !parent) return

        const newPlugin = new PluginContext(DefaultPluginSpec())
        setPlugin(newPlugin)
        const success = await newPlugin.initViewerAsync(canvas, parent)

        if (success) {
          newPlugin.canvas3d?.setProps({
            renderer: {
              backgroundColor: Color(parseInt(bgColor.replace("#", "0x"))),
            },
            interaction: { maxFps: 120 },
          })
          await newPlugin.init()
          setIsPluginReady(true)
        } else {
          console.error("Failed to initialize Mol*")
        }
      } catch (err) {
        console.error("Error initializing Mol*:", err)
      }
    }

    initPlugin()
    return () => { plugin?.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, parentRef])

  // ── Format helpers ────────────────────────────────────────────────────────

  function getTrajectoryFormat(filename: string): BuiltInTrajectoryFormat | undefined {
    switch (filename.toLowerCase().split(".").pop()) {
      case "mmcif": case "cif": return "mmcif"
      case "pdb":   return "pdb"
      case "pdbqt": return "pdbqt"
      case "gro":   return "gro"
      case "xyz":   return "xyz"
      case "mol":   return "mol"
      case "sdf":   return "sdf"
      case "mol2":  return "mol2"
      default:      return undefined
    }
  }

  function getCoordinatesFormat(filename: string): BuiltInCoordinatesFormat | undefined {
    switch (filename.toLowerCase().split(".").pop()) {
      case "dcd":                       return "dcd"
      case "xtc":                       return "xtc"
      case "trr":                       return "trr"
      case "nc": case "nctraj":         return "nctraj"
      case "lammpstrj": case "lammpstrjtxt": return "lammpstrj"
      default: return undefined
    }
  }

  // ── Core: get the actual structure ref from the state tree ────────────────
  // After applyPreset, the Structure node is what we need for color/repr.
  // We query it fresh every time rather than relying on stale state.

  function getStructureRef(p: PluginContext): string | null {
    const structures = p.state.data.selectQ((q) =>
      q.ofType(PluginStateObject.Molecule.Structure)
    )
    return structures.length > 0 ? structures[0].transform.ref : null
  }

  // ── Load topology (PDB / mmCIF / GRO etc.) ────────────────────────────────

  const handleTopologyFileSelect = async (file: File | null) => {
    if (!plugin || !file) return
    if (loadedStructure) {
      toast.error("Clear the current structure before loading a new one")
      return
    }

    setLoading(true)
    try {
      const assetFile: Asset.File = {
        kind: "file",
        id: uuidv4() as UUID,
        name: file.name,
        file,
      }

      const data = await plugin.builders.data.readFile({
        file: assetFile,
        label: file.name,
        isBinary: false,
      })

      const format = getTrajectoryFormat(file.name)
      if (!format) {
        toast.error(`Unsupported format: ${file.name}`)
        return
      }

      const trajectory = await plugin.builders.structure.parseTrajectory(
        data.data.ref,
        format
      )

      // applyPreset builds the full Model → Structure → Representation tree
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default")
      plugin.managers.camera.reset()

      // ── Grab refs from the built tree ──────────────────────────────────────
      const structRef = getStructureRef(plugin)

      const models = plugin.state.data.selectQ((q) =>
        q.ofType(PluginStateObject.Molecule.Model)
      )
      const modelRef = models.length > 0 ? models[0].transform.ref : null

      // ── Extract metadata ───────────────────────────────────────────────────
      let atomCount = 0
      let chains: string[] = []

      if (structRef) {
        const structCell = plugin.state.data.cells.get(structRef)
        const structData = structCell?.obj?.data
        if (structData) {
          atomCount = structData.elementCount

          // Extract unique chain IDs
          const seenChains = new Set<string>()
          for (const unit of structData.units) {
            const hier = unit.model.atomicHierarchy
            const chainIndex = hier.residueAtomSegments.index[unit.elements[0]]
            const chainId = hier.chains.auth_asym_id.value(chainIndex)
            seenChains.add(chainId)
          }
          chains = Array.from(seenChains).sort()
        }
      }

      // ── Representation types ───────────────────────────────────────────────
      const excluded = ["gaussian-volume", "gaussian-surface", "ellipsoid", "carbohydrate"]
      const types = plugin.representation.structure.registry.types.filter(
        ([name]) => !excluded.includes(name)
      )
      setRepresentationTypes(types)
      setRepresentation("default")

      // ── Commit to state ────────────────────────────────────────────────────
      setLoadedStructure({
        structureRef: structRef!,
        modelRef: modelRef!,
        atomCount,
        chains,
        filename: file.name,
      })

    } catch (error) {
      console.error("Error loading structure:", error)
      toast.error("Cannot parse this file")
    } finally {
      setLoading(false)
    }
  }

  // ── Load trajectory (XTC / DCD / TRR etc.) ───────────────────────────────
  // Requires a topology to already be loaded.

  const handleTrajectoryFileSelect = async (file: File | null) => {
    if (!plugin || !file) return
    if (!loadedStructure) {
      toast.error("Load a topology file first")
      return
    }

    setLoading(true)
    try {
      const assetFile: Asset.File = {
        kind: "file",
        id: uuidv4() as UUID,
        name: file.name,
        file,
      }

      const trajectoryData = await plugin.builders.data.readFile({
        file: assetFile,
        label: file.name,
        isBinary: true,
      })

      const format = getCoordinatesFormat(file.name)
      if (!format) {
        toast.error(`Unsupported trajectory format: ${file.name}`)
        return
      }

      await plugin.dataFormats.get(format)?.parse(plugin, trajectoryData.data.ref)
      setIsTrajectoryLoaded(true)

    } catch (error) {
      console.error("Trajectory load failed:", error)
      toast.error("Cannot parse trajectory file")
    } finally {
      setLoading(false)
    }
  }

  // ── Clear everything ──────────────────────────────────────────────────────

  const handleClear = async () => {
    if (!plugin) return
    await plugin.clear()
    setLoadedStructure(null)
    setIsTrajectoryLoaded(false)
    setRepresentation("default")
    setStructureColor("#ffffff")
    setRepresentationTypes([])
  }

  // ── Color ─────────────────────────────────────────────────────────────────
  // Accepts a plain hex string — works from both UI events and WS commands

  const handleChangeStructureColor = useCallback(async (hexColor: string) => {
    console.log("[ColorChange] called with:", hexColor)  // add this
      console.log("[ColorChange] loadedStructure:", loadedStructure)
    if (!plugin || !loadedStructure) {
      console.warn("No structure loaded")
      return
    }
    const { structureRef } = loadedStructure
    const state = plugin.state.data

    if (!state.cells.has(structureRef)) {
      console.warn("Structure ref not found in state:", structureRef)
      return
    }

    const intColor = parseInt(hexColor.replace("#", "0x"))
    const newColor = Color(intColor)

    // .subtree() is critical — applyPreset nests Representation3D deeper than .children() reaches
    const representations = state.selectQ((q) =>
      q
        .byRef(structureRef)
        .subtree()
        .ofType(PluginStateObject.Molecule.Structure.Representation3D)
    )

    console.log(`Applying color ${hexColor} to ${representations.length} representations`)

    for (const repr of representations) {
      await state
        .build()
        .to(repr.transform.ref)
        .update(
          StateTransforms.Representation.StructureRepresentation3D,
          (old) => ({
            ...old,
            colorTheme: {
              name: "uniform",
              params: { value: newColor },
            },
          })
        )
        .commit()
    }

    setStructureColor(hexColor)
  }, [plugin, loadedStructure])

  // ── Representation ────────────────────────────────────────────────────────

  const handleSetRepresentation = useCallback(async (type: string) => {
    if (!plugin || !loadedStructure) return

    const { structureRef } = loadedStructure
    const state = plugin.state.data

    if (!state.cells.has(structureRef)) {
      console.warn("Structure ref not in state")
      return
    }

    const representations = state.selectQ((q) =>
      q
        .byRef(structureRef)
        .subtree()
        .ofType(PluginStateObject.Molecule.Structure.Representation3D)
    )

    for (const repr of representations) {
      await state
        .build()
        .to(repr.transform.ref)
        .update(
          StateTransforms.Representation.StructureRepresentation3D,
          (old) => ({
            ...old,
            type: { name: type, params: {} },
          })
        )
        .commit()
    }

    setRepresentation(type)
  }, [plugin, loadedStructure])

  // ── Background color ──────────────────────────────────────────────────────

  const handleChangeBackgroundColor = useCallback((hexColor: string) => {
    if (!plugin?.canvas3d) return
    const colorValue = Color(parseInt(hexColor.replace("#", "0x")))
    plugin.canvas3d.setProps({ renderer: { backgroundColor: colorValue } })
    setBgColor(hexColor)
  }, [plugin])

  // ── Spin ──────────────────────────────────────────────────────────────────

  const handleToggleSpin = useCallback(() => {
    if (!plugin?.canvas3d) return
    const next = !isSpinning
    setIsSpinning(next)
    plugin.canvas3d.setProps({
      trackball: {
        animate: {
          name: "spin",
          params: { speed: next ? 0.27 : 0 },
        },
      },
    })
  }, [plugin, isSpinning])

  // ── Stereo ────────────────────────────────────────────────────────────────

  const handleToggleStereoView = useCallback(() => {
    if (!plugin?.canvas3d) return
    const next = !isStereoEnabled
    setIsStereoEnabled(next)
    plugin.canvas3d.setProps({
      camera: {
        mode: "perspective",
        stereo: {
          name: next ? "on" : "off",
          params: { eyeSeparation: 0.06, focus: 3.0 },
        },
      },
    })
  }, [plugin, isStereoEnabled])

  // ── Camera ────────────────────────────────────────────────────────────────

  const handleRecenterView = useCallback(() => {
    if (!plugin?.canvas3d) return
    const sphere = plugin.canvas3d.boundingSphere
    plugin.canvas3d.camera.focus(sphere.center, sphere.radius, 500)
  }, [plugin])

  const handleViewModeChange = useCallback((mode: "orthographic" | "perspective") => {
    if (!plugin?.canvas3d) return
    plugin.canvas3d.setProps({ camera: { mode } })
  }, [plugin])

  const handleFullScreenToggle = useCallback(() => {
    if (!parentRef.current) return
    if (!document.fullscreenElement) {
      parentRef.current.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen()
    }
  }, [parentRef])

  // ── Trajectory animation ──────────────────────────────────────────────────

  const toggleTrajectoryAnimation = useCallback(async () => {
    if (!plugin) return
    if (plugin.managers.animation.isAnimating) {
      await plugin.managers.animation.stop()
    } else {
      await plugin.managers.animation.start()
    }
  }, [plugin])

  // ── Focus atom ────────────────────────────────────────────────────────────

  const focusStructureAtom = useCallback((atomNum: number) => {
    if (!plugin || !loadedStructure) return

    const { structureRef } = loadedStructure
    const state = plugin.state.data
    const assembly = state.select(structureRef)[0]

    if (!assembly?.obj?.data) {
      console.warn("No structure data found")
      return
    }

    const structure = assembly.obj.data

    const core = MS.struct.filter.first([
      MS.struct.generator.atomGroups({
        "atom-test": MS.core.rel.eq([
          MS.struct.atomProperty.core.sourceIndex(),
          atomNum - 1,
        ]),
        "group-by": MS.struct.atomProperty.core.operatorName(),
      }),
    ])

    const loci = StructureElement.Loci.fromExpression(structure, core)

    if (StructureElement.Loci.size(loci) === 0) {
      console.warn("No atom found at index", atomNum)
      return
    }

    // Clear previous labels
    plugin.managers.interactivity.lociHighlights.clearHighlights()
    const previousLabels = state.selectQ((q) =>
      q.byRef(structureRef).children().filter((t) => t.obj?.label === "Residue Label")
    )
    const del = state.build()
    previousLabels.forEach((cell) => del.delete(cell.transform.ref))
    del.commit()

    plugin.managers.structure.focus.addFromLoci(loci)
    plugin.managers.camera.focusLoci(loci)

    const update = state.build().to(structureRef)
    update
      .apply(StateTransforms.Model.StructureSelectionFromExpression, {
        label: "Residue Label",
        expression: core,
      })
      .apply(
        StateTransforms.Representation.StructureRepresentation3D,
        createStructureRepresentationParams(plugin, structure, {
          type: "label",
          typeParams: { level: "residue" },
          size: "physical",
        })
      )
    update.commit()

    plugin.managers.interactivity.lociHighlights.highlight({ loci }, true)
  }, [plugin, loadedStructure])

  // ── Snapshot for agent context ────────────────────────────────────────────
  // This is what gets injected into every chat prompt so the agent
  // always knows what's on screen.

  const getSnapshot = useCallback((): ViewerSnapshot => ({
    isStructureLoaded: !!loadedStructure,
    filename: loadedStructure?.filename ?? null,
    atomCount: loadedStructure?.atomCount ?? 0,
    chains: loadedStructure?.chains ?? [],
    representation,
    structureColor,
    bgColor,
    isSpinning,
    isTrajectoryLoaded,
    isStereoEnabled,
  }), [loadedStructure, representation, structureColor, bgColor, isSpinning, isTrajectoryLoaded, isStereoEnabled])

  // ── Expose ────────────────────────────────────────────────────────────────

  return {
    state: {
      isPluginReady,
      loading,
      loadedStructure,      // replaces scattered modelRef/atomcount/isStructureLoaded
      isTrajectoryLoaded,
      representation,
      structureColor,
      bgColor,
      isSpinning,
      isStereoEnabled,
      representationTypes,
      plugin,               // expose for advanced use
    },
    handlers: {
      // File loading
      onTopologyFileSelect: handleTopologyFileSelect,
      onTrajectoryFileSelect: handleTrajectoryFileSelect,
      onClear: handleClear,

      // Visual — all accept plain values, not DOM events
      onChangeStructureColor: handleChangeStructureColor,
      onChangeBackgroundColor: handleChangeBackgroundColor,
      onSetRepresentation: handleSetRepresentation,

      // Camera
      onToggleSpin: handleToggleSpin,
      onToggleStereoView: handleToggleStereoView,
      onRecenterView: handleRecenterView,
      onViewModeChange: handleViewModeChange,
      onFullScreenToggle: handleFullScreenToggle,

      // Trajectory
      onToggleTrajectoryAnimation: toggleTrajectoryAnimation,

      // Atom focus
      onFocusAtom: focusStructureAtom,

      // Agent context
      getSnapshot,
    },
  }
}