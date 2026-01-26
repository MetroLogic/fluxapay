import { Button } from "@/components/Button";
import { Link, FileText, Download } from "lucide-react";

export const QuickActions = () => {
    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm h-full col-span-1 lg:col-span-3">
            <div className="p-6 pb-2">
                <h3 className="text-lg font-semibold leading-none tracking-tight">Quick Actions</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Succinct shortcuts for common tasks.
                </p>
            </div>
            <div className="p-6 grid gap-4">
                <Button className="w-full justify-start h-12" variant="default">
                    <Link className="mr-2 h-4 w-4" />
                    Create Payment Link
                </Button>
                <Button className="w-full justify-start h-12" variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    View API Documentation
                </Button>
                <Button className="w-full justify-start h-12" variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Download Settlement Report
                </Button>
            </div>
        </div>
    );
};
