/** Incident z analizy ML (zagregowany szablon z DRAIN) */
export interface Incident {
    id?: string;
    incidentTemplate: string;
    occurrences: number;
    avgScore: number;
    severity: number;
    exampleLog: string;
}

export interface Job {
    id: string;
    filename: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    incidentCount: number;
    createdAt: string;
    /** Tablica incydentów lub undefined przy PENDING/FAILED */
    incidents?: Incident[];
}

export interface JobUpdatePayload {
    jobId: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    incidentCount: number;
    /** Tablica incydentów lub undefined przy PENDING/FAILED */
    incidents?: Incident[];
}