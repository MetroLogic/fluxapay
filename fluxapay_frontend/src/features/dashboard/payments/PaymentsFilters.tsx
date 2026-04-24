import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";
import { Search, Save, XCircle } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface PaymentsFiltersProps {
    searchValue: string;
    statusValue: string;
    currencyValue: string;
    onSearchChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onCurrencyChange: (value: string) => void;
}

interface SavedPreset {
    id: string;
    name: string;
    search: string;
    status: string;
    currency: string;
}

export const PaymentsFilters = memo(({
    searchValue,
    statusValue,
    currencyValue,
    onSearchChange,
    onStatusChange,
    onCurrencyChange,
}: PaymentsFiltersProps) => {
    const [presets, setPresets] = useState<SavedPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>("default");

    // Load presets on mount
    useEffect(() => {
        queueMicrotask(() => {
            try {
                const saved = localStorage.getItem("fluxapay_payment_presets");
                if (saved) {
                    setPresets(JSON.parse(saved) as SavedPreset[]);
                }
            } catch (e) {
                console.error("Failed to load presets", e);
            }
        });
    }, []);

    const savePresets = (newPresets: SavedPreset[]) => {
        setPresets(newPresets);
        localStorage.setItem("fluxapay_payment_presets", JSON.stringify(newPresets));
    };

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchChange(e.target.value);
        setSelectedPresetId("custom");
    }, [onSearchChange]);

    const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onStatusChange(e.target.value);
        setSelectedPresetId("custom");
    }, [onStatusChange]);

    const handleCurrencyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onCurrencyChange(e.target.value);
        setSelectedPresetId("custom");
    }, [onCurrencyChange]);

    const handleSavePreset = () => {
        const name = prompt("Enter a name for this filter preset:");
        if (!name) return;

        const newPreset: SavedPreset = {
            id: `preset_${Date.now()}`,
            name,
            search: searchValue,
            status: statusValue,
            currency: currencyValue,
        };

        savePresets([...presets, newPreset]);
        setSelectedPresetId(newPreset.id);
        toast.success(`Preset "${name}" saved!`);
    };

    const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedPresetId(id);
        
        if (id === "default") {
            onSearchChange("");
            onStatusChange("all");
            onCurrencyChange("all");
            return;
        }

        const preset = presets.find(p => p.id === id);
        if (preset) {
            onSearchChange(preset.search);
            onStatusChange(preset.status);
            onCurrencyChange(preset.currency);
        }
    };

    const handleReset = () => {
        onSearchChange("");
        onStatusChange("all");
        onCurrencyChange("all");
        setSelectedPresetId("default");
    };

    return (
        <div className="flex flex-col gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Saved Filters:</span>
                    <Select 
                        className="w-full md:w-[200px]"
                        value={selectedPresetId}
                        onChange={handleLoadPreset}
                    >
                        <option value="default">Default</option>
                        {presets.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="custom" disabled hidden>Custom</option>
                    </Select>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="gap-2 flex-1 md:flex-none"
                        onClick={handleReset}
                    >
                        <XCircle className="w-4 h-4" />
                        Clear Filters
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 flex-1 md:flex-none"
                        onClick={handleSavePreset}
                    >
                        <Save className="w-4 h-4" />
                        Save Filter
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by ID, Order ID, or customer..."
                        className="pl-10"
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                </div>
                <div className="flex gap-4">
                    <Select
                        className="w-[150px]"
                        value={statusValue}
                        onChange={handleStatusChange}
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="expired">Expired</option>
                        <option value="failed">Failed</option>
                    </Select>
                    <Select
                        className="w-[120px]"
                        value={currencyValue}
                        onChange={handleCurrencyChange}
                    >
                        <option value="all">All Currencies</option>
                        <option value="USDC">USDC</option>
                        <option value="XLM">XLM</option>
                        <option value="EURC">EURC</option>
                    </Select>
                </div>
            </div>
        </div>
    );
});
PaymentsFilters.displayName = "PaymentsFilters";
