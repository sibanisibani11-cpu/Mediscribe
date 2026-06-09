import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface SyncConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    action: "push" | "pull";
}

export function SyncConfirmDialog({ open, onOpenChange, onConfirm, action }: SyncConfirmDialogProps) {
    const isPush = action === "push";
    const title = isPush ? "Overwrite Cloud Data?" : "Overwrite Local Data?";
    const description = isPush
        ? "This will permanently replace your Cloud backup with the data currently on this device. Any unique data on the Cloud will be lost."
        : "This will permanently replace your current local data with the backup from the Cloud. Any unique data on this device will be lost.";

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="w-[400px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="h-5 w-5" />
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4">
                    <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs font-bold"
                    >
                        Yes, Overwrite
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
