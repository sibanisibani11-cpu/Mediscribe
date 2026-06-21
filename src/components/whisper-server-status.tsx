"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Server } from "lucide-react";
import { Button } from "./ui/button";

type ServerStatus = 'stopped' | 'starting' | 'ready' | 'error';

export function WhisperServerStatus() {
    const [status, setStatus] = useState<ServerStatus>('stopped');
    const [isRestarting, setIsRestarting] = useState(false);

    useEffect(() => {
        // Get initial status
        const getStatus = async () => {
            if ((window as any).electron) {
                const result = await (window as any).electron.getWhisperServerStatus();
                setStatus(result.status);
            }
        };
        getStatus();

        // Listen for status updates
        if ((window as any).electron) {
            const removeListener = (window as any).electron.onWhisperServerStatus((newStatus: ServerStatus) => {
                setStatus(newStatus);
                if (newStatus === 'ready' || newStatus === 'error') {
                    setIsRestarting(false);
                }
            });
            return () => {
                if (typeof removeListener === 'function') removeListener();
            };
        }
    }, []);

    const handleRestart = async () => {
        setIsRestarting(true);
        try {
            if ((window as any).electron) {
                await (window as any).electron.restartWhisperServer();
            }
        } catch (error) {
            console.error("Restart failed:", error);
            setIsRestarting(false);
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'ready':
                return 'bg-green-500';
            case 'starting':
                return 'bg-yellow-500 animate-pulse';
            case 'error':
                return 'bg-red-500';
            case 'stopped':
                return 'bg-gray-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'ready':
                return 'Ready';
            case 'starting':
                return 'Starting...';
            case 'error':
                return 'Error';
            case 'stopped':
                return 'Stopped';
            default:
                return 'Unknown';
        }
    };

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-secondary/30 rounded-lg border border-border">
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <div
                        className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${getStatusColor()} border-2 border-background`}
                        title={getStatusText()}
                    />
                </div>
                <div>
                    <p className="text-sm font-medium">Whisper Server</p>
                    <p className="text-xs text-muted-foreground">{getStatusText()}</p>
                </div>
            </div>

            {/* Restart Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={handleRestart}
                disabled={isRestarting || status === 'starting'}
                className="ml-auto"
            >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRestarting ? 'animate-spin' : ''}`} />
                Restart
            </Button>
        </div>
    );
}
