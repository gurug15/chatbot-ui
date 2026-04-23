"use client"

import { RefObject, useEffect, useRef, useState } from "react"
import { PluginContext } from "molstar/lib/mol-plugin/context"
import { DefaultPluginSpec } from "molstar/lib/mol-plugin/spec"
import { UUID } from "molstar/lib/mol-util"
import { Asset } from "molstar/lib/mol-util/assets"
import { v4 as uuidv4 } from "uuid"
import { Color } from "molstar/lib/mol-util/color"
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects"
import {
  BuiltInCoordinatesFormat,
  XtcProvider,
} from "molstar/lib/mol-plugin-state/formats/coordinates"
import { PluginCommands } from "molstar/lib/mol-plugin/commands"
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms"
import { BuiltInTrajectoryFormat } from "molstar/lib/mol-plugin-state/formats/trajectory"
import toast from "react-hot-toast"

import { MolScriptBuilder as MS } from "molstar/lib/mol-script/language/builder"
import { StructureElement } from "molstar/lib/mol-model/structure"
import { StateSelection } from "molstar/lib/mol-state"
import { createStructureRepresentationParams } from "molstar/lib/mol-plugin-state/helpers/structure-representation-params"

// Custom hook to encapsulate Mol* logic
export const useMolstar = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  parentRef: RefObject<HTMLDivElement | null>
) => {
  // Internal state for the plugin and UI
  const [plugin, setPlugin] = useState<PluginContext | null>(null)
  const [isPluginReady, setIsPluginReady] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [bgColor, setBgColor] = useState("#000000")
  const [structureColor, setStructureColor] = useState<string>("#ffffff")
  const [representationTypes, setRepresentationTypes] = useState<
    [string, string][]
  >([])
  // const [rotationSpeed, setRotationSpeed] = useState(0.25);
  const [selectedRepresentation, setSelectedRepresentation] =
    useState<string>("default")
  const [isStructureLoaded, setIsStructureLoaded] = useState(false)
  const [isStereoEnabled, setIsStereoEnabled] = useState(false)
  const [topologyModel, setTopologyModel] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [modelRef, setModelRef] = useState<string | null>(null)
  const [atomcount, setAtomcount] = useState<number>(0)

  // // Effect for plugin initialization and disposal
  useEffect(() => {
    // Create and initialize the plugin

    const initPlugin = async () => {
      // console.log("Initial
      try {
        const canvas = canvasRef.current
        const parent = parentRef.current
        // console.log("Canvas ref:", canvas);
        // console.log("Parent ref:", parent);
        if (!canvas || !parent) return

        // Use default spec for initialization
        const newPlugin = new PluginContext(DefaultPluginSpec())
        setPlugin(newPlugin)
        const success = await newPlugin.initViewerAsync(canvas, parent)

        if (success) {
          setIsPluginReady(true)
          // console.log("Mol*Star initialized successfully!");

          // Set initial background color (original logic had this in spec,
          // but better to set explicitly after init)
          newPlugin.canvas3d?.setProps({
            renderer: {
              backgroundColor: Color(parseInt(bgColor.replace("#", "0x"))),
            },
            interaction: {
              maxFps: 120,
            },
          })

          await newPlugin.init()
        } else {
          console.error("Failed to initialize Mol*Star")
        }
      } catch (err) {
        console.error("Error initializing Mol*Star:", err)
      }
    }

    initPlugin()

    // Cleanup on unmount
    return () => {
      plugin?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, parentRef])

  // --- Event Handlers as Functions ---
  function getFormatByExtension(
    filename: string
  ): BuiltInTrajectoryFormat | undefined {
    const ext = filename.toLowerCase().split(".").pop()
    switch (ext) {
      case "mmcif":
      case "cif":
        return "mmcif" // or 'cifCore' as needed
      case "pdb":
        return "pdb"
      case "pdbqt":
        return "pdbqt"
      case "gro":
        return "gro"
      case "xyz":
        return "xyz"
      case "mol":
        return "mol"
      case "sdf":
        return "sdf"
      case "mol2":
        return "mol2"
      case "data": // for LAMMPS data files
        return "lammps_data"
      case "traj": // for LAMMPS trajectory files
        return "lammps_traj_data"
      default:
        return undefined
    }
  }

  function getMolstarCoordinatesFormat(
    filename: string
  ): BuiltInCoordinatesFormat | undefined {
    const ext = filename.toLowerCase().split(".").pop()
    switch (ext) {
      case "dcd":
        return "dcd"
      case "xtc":
        return "xtc"
      case "trr":
        return "trr"
      case "nc":
      case "nctraj":
        return "nctraj"
      case "lammpstrj":
      case "lammpstrjtxt":
        return "lammpstrj"
      default:
        return undefined
    }
  }

  const handleTopologyFileSelect = async (file: File | null) => {
    if (!plugin) {
      console.warn("Plugin not ready yet!")
      return
    }
    if (!file || isStructureLoaded) return
    const assetFile: Asset.File = {
      kind: "file",
      id: uuidv4() as UUID,
      name: file.name,
      file: file,
    }
    // console.log("plugin in file select:", plugin);
    try {
      const data = await plugin.builders.data.readFile({
        file: assetFile,
        label: file.name,
        isBinary: false,
      })
      const format: BuiltInTrajectoryFormat | undefined = getFormatByExtension(
        file.name
      )
      const topology = await plugin.builders.structure.parseTrajectory(
        data.data.ref,
        format!
      )
      if (topology.obj?.data) {
        const atomCount =
          //@ts-ignore
          topology.obj.data.frames[0]?.atomicConformation?.x?.length
        console.log("Atom count:", atomCount) // 409
        setAtomcount(atomCount)
      }
      const topologyModel =
        await plugin.builders.structure.createModel(topology)
      setTopologyModel(topologyModel)

      setIsStructureLoaded(true)
      const excludedTypes = [
        "gaussian-volume",
        "gaussian-surface",
        "ellipsoid",
        "carbohydrate",
      ]
      const structures1 = plugin.state.data.selectQ((q) =>
        q.ofType(PluginStateObject.Molecule.Structure)
      )
      console.log("Structures found:", structures1.length)
      console.log("Structure cells:", structures1)

      if (structures1.length > 0) {
        console.log("First structure obj:", structures1[0].obj)
        console.log("Has data?", structures1[0].obj?.data)

        if (structures1[0].obj?.data) {
          console.log("Element count:", structures1[0].obj.data.elementCount)
          setAtomcount(structures1[0].obj.data.elementCount)
        }
      }
      await plugin.builders.structure.hierarchy.applyPreset(topology, "default")
      plugin.managers.camera.reset()
      // Filter and set representation types first
      const filteredTypes =
        plugin.representation.structure.registry.types.filter(
          (name) => !excludedTypes.includes(name[0])
        )
      // console.log("Filtered representation types:", filteredTypes);
      setRepresentationTypes(filteredTypes)
      setSelectedRepresentation("default")

      const models = plugin.state.data.selectQ((q: any) =>
        q.ofType(PluginStateObject.Molecule.Model)
      )

      if (models.length > 0) {
        const ref = models[0].transform.ref
        // console.log("all Structure loaded. Model ref:", ref);
        setModelRef(ref)
        // Extract and set atom count only once

        return ref // ← RETURN THE REF
      }
    } catch (error) {
      console.error(" Error loading file:", error)
      toast.error("cant parse this file")
    }
  }

  const handleTrajectoryFileSelect = async (file: File | null) => {
    if (!plugin) {
      console.warn("Plugin not ready yet!")
      return
    }
    if (!file || !isStructureLoaded) return
    setLoading(true)
    const assetFile: Asset.File = {
      kind: "file",
      id: uuidv4() as UUID,
      name: file.name,
      file: file,
    }
    try {
      // console.log("before trajectory data");
      const trajectoryData = await plugin.builders.data.readFile({
        file: assetFile,
        label: file.name,
        isBinary: true,
      })
      // console.log("before format");
      const format: BuiltInCoordinatesFormat | undefined =
        getMolstarCoordinatesFormat(file.name)
      if (format === undefined) {
        console.error("Unsupported trajectory file format")
        return
      }
      // console.log("before result");
      // console.log("all state data", plugin.state.data);

      const result = await plugin.dataFormats
        .get(format)
        ?.parse(plugin, trajectoryData.data.ref)
      setLoading(false)
    } catch (error: any) {
      console.error("Transform failed:", error)
    } finally {
      setLoading(false)
    } // console.log("Current animation tick:", plugin.managers.animation.tick(60));
  }

  const loadStructureRepresentation = async () => {
    if (!plugin) return null
    if (!plugin || !topologyModel) {
      console.error("Plugin or topology model not ready")
      return null
    }
    // setModelRef(modelRef);
    return modelRef
  }

  const toggleTragractoryAnimation = async () => {
    if (!plugin) return
    const curentAnimation = plugin.managers.animation.current
    console.log("Current animation:", plugin.managers.animation)
    if (curentAnimation) {
      if (plugin.managers.animation.isAnimating) {
        console.log("animation:", plugin.managers.animation.isAnimating)
        await plugin.managers.animation.stop()
      } else {
        await plugin.managers.animation.start()
      }
    }
  }

  const handleChangeBackgroundColor = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newColor = event.target.value
    setBgColor(newColor) // Update React state

    if (!plugin?.canvas3d) {
      console.warn("Canvas not ready")
      return
    }

    // Use the new color value directly, not the stale state
    const intColor = parseInt(newColor.replace("#", "0x"))
    const colorValue = Color(intColor)

    plugin.canvas3d.setProps({
      renderer: {
        backgroundColor: colorValue,
      },
    })
  }

  const handleToggleSpin = () => {
    if (!plugin?.canvas3d) {
      console.warn("Canvas not ready")
      return
    }
    // setRotationSpeed(rotateSpeed);
    // Use the new state value for the logic
    const newSpinState = !isSpinning
    setIsSpinning(newSpinState)

    plugin.canvas3d.setProps({
      trackball: {
        animate: {
          name: "spin",
          params: {
            speed: newSpinState ? 0.27 : 0, // Use new state
          },
        },
      },
    })
  }

  const handleChangeStructureColor = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newColorHex = event.target.value
    setStructureColor(newColorHex)

    if (!plugin) return

    const STRUCTURE_REF = "streaming-structure"
    const state = plugin.state.data

    const representations = state.selectQ((q) =>
      q
        .byRef(STRUCTURE_REF)
        .children()
        .ofType(PluginStateObject.Molecule.Structure.Representation3D)
    )
    if (!state.cells.has(STRUCTURE_REF)) {
      console.warn("Streaming structure not found")
      return
    }

    const intColor = parseInt(newColorHex.replace("#", "0x"))
    const newColor = Color(intColor)

    for (const repr of representations) {
      await state
        .build()
        .to(repr.transform.ref)
        .update(
          StateTransforms.Representation.ShapeRepresentation3D,
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
  }

  const handleSetRepresentation = async (type: string) => {
    if (!plugin) return

    setSelectedRepresentation(type)

    const STRUCTURE_REF = "streaming-structure"
    const state = plugin.state.data

    if (!state.cells.has(STRUCTURE_REF)) {
      console.warn("Streaming structure not found. Start animation first.")
      return
    }

    const representations = state.selectQ((q) =>
      q
        .byRef(STRUCTURE_REF)
        .children()
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
            type: {
              name: type,
              params: {},
            },
          })
        )
        .commit()
    }
  }

  const handleFullScreenToggle = () => {
    if (!parentRef.current) return

    if (!document.fullscreenElement) {
      parentRef.current.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message} (${err.name})`
        )
      })
    } else {
      document.exitFullscreen()
    }
  }

  const handleViewModeChange = (mode: string) => {
    if (!plugin?.canvas3d) return
    // Logic to change view mode based on the selected option
    switch (mode) {
      case "orthographic":
        plugin.canvas3d.setProps({
          camera: { mode: "orthographic" },
        })
        break
      case "perspective":
        plugin.canvas3d.setProps({
          camera: { mode: "perspective" },
        })
        break
      default:
        toast.error(`Unknown view mode: ${mode}`)
    }
  }

  const handleToggleStereoView = () => {
    if (!plugin?.canvas3d) {
      toast.error("Canvas not ready")
      return
    }

    const newStereoState = !isStereoEnabled
    setIsStereoEnabled(newStereoState)

    plugin.canvas3d.setProps({
      camera: {
        mode: "perspective",
        stereo: {
          name: newStereoState ? "on" : "off",
          params: {
            eyeSeparation: 0.06,
            focus: 3.0,
          },
        },
      },
    })
  }

  const handleRecenterView = () => {
    if (!plugin?.canvas3d) return

    const sphere = plugin.canvas3d.boundingSphere
    plugin.canvas3d.camera.focus(
      sphere.center,
      sphere.radius,
      500 // animation duration
    )
  }

  const focusStructureAtom = (atomNum: number) => {
    if (!plugin) return

    const STRUCTURE_REF = "streaming-structure"
    const state = plugin.state.data

    const assembly = state.select(STRUCTURE_REF)[0]
    console.log("assembly", assembly)
    if (!assembly?.obj?.data) {
      console.log("No assembly found")
      return
    }

    const structure = assembly.obj.data

    const unit = structure.units[0]
    // console.log("First 10 atoms in unit:");
    // for (let i = 0; i < 10; i++) {
    //   console.log(`Atom ${i}:`, unit.elements[i]);
    // }

    console.log("Structure units:", structure.units)
    console.log("Structure elementCount:", structure.elementCount)
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

    if (StructureElement.Loci.size(loci) > 0) {
      // Clear previous highlights first
      plugin.managers.interactivity.lociHighlights.clearHighlights()

      const previousLabels = state.selectQ((q) =>
        q
          .byRef(STRUCTURE_REF)
          .children()
          .filter((t) => t.obj?.label === "Residue Label")
      )

      const deleteUpdate = state.build()
      previousLabels.forEach((cell) => deleteUpdate.delete(cell.transform.ref))
      deleteUpdate.commit()
      plugin.managers.structure.focus.addFromLoci(loci)
      plugin.managers.camera.focusLoci(loci)
      const update = state.build().to(STRUCTURE_REF)
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
      plugin.managers.interactivity.lociHighlights.highlight(
        { loci: loci },
        true
      )
    } else {
      console.log("No atoms found with sourceIndex")
    }
  }

  // Return state and handlers for the component to use
  return {
    state: {
      isPluginReady,
      isSpinning,
      bgColor,
      structureColor,
      representationTypes,
      selectedRepresentation,
      isStructureLoaded,
      isStereoEnabled,
      loading,
      plugin,
      modelRef,
      atomcount,
    },
    handlers: {
      setLoading: setLoading,
      onTopologyFileSelect: handleTopologyFileSelect,
      onTrajectoryFileSelect: handleTrajectoryFileSelect,
      onChangeBackgroundColor: handleChangeBackgroundColor,
      onToggleSpin: handleToggleSpin,
      onChangeStructureColor: handleChangeStructureColor,
      onSetRepresentation: (value: string) => handleSetRepresentation(value),
      onToggleStereoView: handleToggleStereoView,
      onRecenterView: handleRecenterView,
      toggleTragractoryAnimation: toggleTragractoryAnimation,
      handleViewModeChange: handleViewModeChange,
      handleFullScreenToggle: handleFullScreenToggle,
      loadStructureRepresentation: loadStructureRepresentation,
      focusStructureAtom: focusStructureAtom,
    },
  }
}
