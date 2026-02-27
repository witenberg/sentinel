"use client"; // To musi być na górze!

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Job, JobUpdatePayload } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

export default function Dashboard() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState("Rozłączony");
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    // Ref, żeby trzymać instancję socketa
    const socketRef = useRef<Socket | null>(null);

    // 1. Inicjalizacja danych i WebSocketów
    useEffect(() => {
        fetchHistory();

        // Połączenie z Socket.IO
        socketRef.current = io(WS_URL, {
            path: "/socket.io",
            transports: ["websocket", "polling"],
            reconnection: true,
            timeout: 10000,
        });

        socketRef.current.on("connect", () => setConnectionStatus("Połączony ✅"));
        socketRef.current.on("disconnect", () => setConnectionStatus("Rozłączony ❌"));
        socketRef.current.on("connect_error", (error) => {
            setConnectionStatus("Rozłączony ❌");
            console.error("Socket connection error:", error.message);
        });

        // Nasłuchiwanie na aktualizacje zadań (z naszego NestJS Gateway)
        socketRef.current.on("job_update", (updatedJob: JobUpdatePayload) => {
            console.log("Otrzymano update:", updatedJob);

            const incidentCount = updatedJob.incidentCount ?? 0;
            const incidents = updatedJob.incidents;

            setJobs((prevJobs) => {
                return prevJobs.map((job) => {
                    if (job.id === updatedJob.jobId) {
                        return {
                            ...job,
                            status: updatedJob.status,
                            incidentCount,
                            incidents: incidents ?? job.incidents,
                        };
                    }
                    return job;
                });
            });

            // Zaktualizuj otwarty modal szczegółów, jeśli dotyczy tego samego joba
            setSelectedJob((prev) => {
                if (!prev || prev.id !== updatedJob.jobId) return prev;
                return {
                    ...prev,
                    status: updatedJob.status,
                    incidentCount,
                    incidents: incidents ?? prev.incidents,
                };
            });
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    const fetchHistory = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/logs/history`);
            setJobs(data);
        } catch (error) {
            console.log(error);
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    console.error("Rate limit exceeded dla /logs/history");
                } else {
                    console.error("Błąd pobierania historii:", error.response?.statusText);
                }
            } else {
                console.error("Błąd pobierania historii:", error);
            }
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            // Upload do NestJS
            const { data } = await axios.post(`${API_URL}/logs/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            // Optymistyczne dodanie zadania do listy (zanim przyjdzie socket)
            const newJob: Job = {
                id: data.jobId,
                filename: file.name,
                status: "PENDING",
                incidentCount: 0,
                createdAt: new Date().toISOString(),
                incidents: [],
            };

            setJobs((prev) => [newJob, ...prev]);
            setFile(null); // Reset inputa
            // Reset inputa w DOM (brzydki hack, ale działa w MVP)
            (document.getElementById("fileInput") as HTMLInputElement).value = "";

        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 429) {
                    console.log(error.response.headers);
                    const retryAfter = error.response.headers['retry-after-upload'];
                    const message = retryAfter
                        ? `⚠️ Za dużo żądań!\n\nPrzekroczono limit 5 uploadów na minutę.\nSpróbuj ponownie za ${retryAfter} sekund.`
                        : '⚠️ Za dużo żądań!\n\nPrzekroczono limit 5 uploadów na minutę.\nPoczekaj chwilę i spróbuj ponownie.';
                    alert(message);
                } else if (error.response.status === 400) {
                    alert('❌ Błąd: Nieprawidłowy plik lub brak pliku!');
                } else if (error.response.status === 500) {
                    alert('❌ Błąd serwera! Spróbuj ponownie później.');
                } else {
                    alert(`❌ Błąd uploadu: ${error.response.statusText || 'Nieznany błąd'}`);
                }
            } else {
                alert('❌ Błąd połączenia z serwerem!');
            }
            console.error('Upload error:', error);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto font-sans">
            <h1 className="text-3xl font-bold mb-4">Sentinel Dashboard 🛡️</h1>

            <div className="mb-6 p-4 border border-gray-300 rounded bg-gray-50">
                <p className="text-sm text-gray-600 mb-2">Status Socket: <strong>{connectionStatus}</strong></p>

                <div className="flex gap-4 items-center">
                    <input
                        id="fileInput"
                        type="file"
                        accept=".log,.txt"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
                    />
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className={`px-6 py-2 rounded text-white font-bold transition-colors ${!file || uploading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
                            }`}
                    >
                        {uploading ? "Wysyłanie..." : "Analizuj Logi"}
                    </button>
                </div>
            </div>

            <h2 className="text-xl font-semibold mb-4">Ostatnie Analizy</h2>

            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 shadow-sm">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-2 px-4 border-b text-left">Plik</th>
                            <th className="py-2 px-4 border-b text-left">Status</th>
                            <th className="py-2 px-4 border-b text-left">Incydenty</th>
                            <th className="py-2 px-4 border-b text-left">Data</th>
                            <th className="py-2 px-4 border-b text-left">Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                                <td className="py-2 px-4 border-b font-mono text-sm">{job.filename}</td>
                                <td className="py-2 px-4 border-b">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                        job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {job.status}
                                    </span>
                                </td>
                                <td className="py-2 px-4 border-b">
                                    {job.status === 'PENDING' ? (
                                        "-"
                                    ) : (
                                        <span className={job.incidentCount > 0 ? "text-red-600 font-bold" : "text-green-600"}>
                                            {job.incidentCount}
                                        </span>
                                    )}
                                </td>
                                <td className="py-2 px-4 border-b text-xs text-gray-500">
                                    {new Date(job.createdAt).toLocaleString()}
                                </td>
                                <td className="py-2 px-4 border-b">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedJob(job)}
                                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        Szczegóły
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {jobs.length === 0 && (
                    <p className="text-center p-4 text-gray-500">Brak historii analiz.</p>
                )}
            </div>

            {/* Panel szczegółów analizy */}
            {selectedJob && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => setSelectedJob(null)}
                    role="dialog"
                    aria-label="Szczegóły analizy"
                >
                    <div
                        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-semibold">Szczegóły analizy: {selectedJob.filename}</h3>
                            <button
                                type="button"
                                onClick={() => setSelectedJob(null)}
                                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                                aria-label="Zamknij"
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <dl className="grid grid-cols-2 gap-2 mb-4 text-sm">
                                <dt className="text-gray-500">Status</dt>
                                <dd>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${selectedJob.status === "COMPLETED" ? "bg-green-100 text-green-800" : selectedJob.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                                        {selectedJob.status}
                                    </span>
                                </dd>
                                <dt className="text-gray-500">Data</dt>
                                <dd>{new Date(selectedJob.createdAt).toLocaleString()}</dd>
                                <dt className="text-gray-500">Liczba incydentów</dt>
                                <dd className="font-medium">{selectedJob.incidentCount}</dd>
                            </dl>

                            {selectedJob.status === "PENDING" && (
                                <p className="text-gray-500 text-sm">Analiza w toku. Wyniki pojawią się po zakończeniu.</p>
                            )}

                            {selectedJob.status === "FAILED" && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                                    <strong>Błąd:</strong> Analiza nie powiodła się.
                                </div>
                            )}

                            {selectedJob.status === "COMPLETED" && (() => {
                                const incidents = selectedJob.incidents ?? [];
                                if (incidents.length === 0) {
                                    return (
                                        <p className="text-green-600 text-sm font-medium">Brak wykrytych incydentów bezpieczeństwa.</p>
                                    );
                                }
                                return (
                                    <>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Wykryte incydenty (zagregowane wg szablonów)</h4>
                                        <div className="border border-gray-200 rounded overflow-hidden">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="py-2 px-3 border-b text-left">Szablon</th>
                                                        <th className="py-2 px-3 border-b text-left">Wystąpienia</th>
                                                        <th className="py-2 px-3 border-b text-left">Śr. Score</th>
                                                        <th className="py-2 px-3 border-b text-left">Severity</th>
                                                        <th className="py-2 px-3 border-b text-left">Przykładowy log</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {incidents.map((incident, idx) => (
                                                        <tr key={incident.id ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                            <td className="py-2 px-3 font-mono text-xs max-w-xs truncate" title={incident.incidentTemplate}>
                                                                {incident.incidentTemplate}
                                                            </td>
                                                            <td className="py-2 px-3 font-bold text-center">
                                                                <span className={incident.occurrences > 10 ? "text-red-600" : "text-orange-600"}>
                                                                    {incident.occurrences}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 px-3 font-mono text-xs">{incident.avgScore.toFixed(4)}</td>
                                                            <td className="py-2 px-3">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold ${incident.severity >= 3 ? 'bg-red-100 text-red-800' : incident.severity >= 1 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                                                    {incident.severity}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 px-3 font-mono text-xs max-w-md truncate" title={incident.exampleLog}>
                                                                {incident.exampleLog}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}