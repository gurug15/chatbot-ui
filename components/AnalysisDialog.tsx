import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { HelicalCharts } from "./HelicalGraphs"

export function AnalysisDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Analysis</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rmsd</DialogTitle>
          <DialogDescription>This is a dialog with Analysis.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
          <HelicalCharts />
        </div>
      </DialogContent>
    </Dialog>
  )
}
