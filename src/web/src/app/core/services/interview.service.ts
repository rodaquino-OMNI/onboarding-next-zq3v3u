/**
 * @fileoverview Enhanced interview service for managing healthcare enrollment video interviews
 * @version 1.0.0
 * Implements HIPAA-compliant video interview management with quality monitoring
 */

import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subject, ReplaySubject } from 'rxjs';
import { map, catchError, tap, debounceTime, retryWhen, delay } from 'rxjs/operators';

import {
  Interview,
  InterviewStatus,
  CreateInterviewRequest,
  UpdateInterviewRequest,
  InterviewQuality,
  InterviewMetrics
} from '../interfaces/interview.interface';
import { ApiService } from '../http/api.service';
import { VideoService } from './video.service';

@Injectable({
  providedIn: 'root'
})
export class InterviewService {
  private readonly apiEndpoint: string = '/interviews';
  private currentInterview: BehaviorSubject<Interview | null> = new BehaviorSubject<Interview | null>(null);
  private qualityMetrics: Subject<InterviewQuality> = new Subject<InterviewQuality>();
  private networkStatus: ReplaySubject<boolean> = new ReplaySubject<boolean>(1);
  private sessionRecording: boolean = false;
  private readonly retryAttempts: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(
    private apiService: ApiService,
    private videoService: VideoService
  ) {
    this.initializeNetworkMonitoring();
  }

  /**
   * Schedule a new video interview
   * @param request Interview scheduling request
   * @returns Observable<Interview>
   */
  public scheduleInterview(request: CreateInterviewRequest): Observable<Interview> {
    return this.apiService.post<Interview>(this.apiEndpoint, request).pipe(
      tap(interview => this.currentInterview.next(interview)),
      catchError(error => {
        console.error('Failed to schedule interview:', error);
        throw error;
      })
    );
  }

  /**
   * Start a scheduled video interview
   * @param id Interview identifier
   * @returns Observable<Interview>
   */
  public startInterview(id: string): Observable<Interview> {
    return this.apiService.get<Interview>(`${this.apiEndpoint}/${id}`).pipe(
      tap(async interview => {
        try {
          // Initialize video session
          await this.videoService.initializeSession(
            interview.session.sessionId,
            interview.session.token,
            {
              status: 'good',
              metrics: { bitrate: 750000, packetLoss: 0, latency: 0 }
            }
          );

          // Start session recording if enabled
          if (interview.session.recording.enabled) {
            await this.videoService.startRecording({
              format: interview.session.recording.format,
              retention: interview.session.recording.retention
            });
            this.sessionRecording = true;
          }

          // Monitor video quality
          this.monitorQuality(interview.session.sessionId);

          // Update interview status
          const updateRequest: UpdateInterviewRequest = {
            status: InterviewStatus.IN_PROGRESS,
            notes: '',
            completed_at: new Date()
          };
          await this.updateInterview(id, updateRequest).toPromise();

          this.currentInterview.next(interview);
        } catch (error) {
          console.error('Failed to start interview:', error);
          throw error;
        }
      }),
      retryWhen(errors => 
        errors.pipe(
          delay(this.retryDelay),
          tap(error => {
            if (error.status === 503) {
              throw error;
            }
          })
        )
      )
    );
  }

  /**
   * End an ongoing video interview
   * @param id Interview identifier
   * @param notes Interview notes
   * @param metrics Interview metrics
   * @returns Observable<Interview>
   */
  public endInterview(id: string, notes: string, metrics: InterviewMetrics): Observable<Interview> {
    return new Observable(observer => {
      this.videoService.endSession().then(() => {
        const updateRequest: UpdateInterviewRequest = {
          status: InterviewStatus.COMPLETED,
          notes: notes,
          completed_at: new Date()
        };

        this.updateInterview(id, updateRequest).subscribe({
          next: (interview) => {
            this.currentInterview.next(null);
            this.sessionRecording = false;
            observer.next(interview);
            observer.complete();
          },
          error: (error) => {
            console.error('Failed to end interview:', error);
            observer.error(error);
          }
        });
      }).catch(error => {
        console.error('Failed to end video session:', error);
        observer.error(error);
      });
    });
  }

  /**
   * Get current interview status
   * @returns Observable<Interview | null>
   */
  public getCurrentInterview(): Observable<Interview | null> {
    return this.currentInterview.asObservable();
  }

  /**
   * Get interview quality metrics
   * @returns Observable<InterviewQuality>
   */
  public getQualityMetrics(): Observable<InterviewQuality> {
    return this.qualityMetrics.asObservable();
  }

  /**
   * Get network connection status
   * @returns Observable<boolean>
   */
  public getNetworkStatus(): Observable<boolean> {
    return this.networkStatus.asObservable();
  }

  /**
   * Update interview details
   * @param id Interview identifier
   * @param request Update request
   * @returns Observable<Interview>
   */
  private updateInterview(id: string, request: UpdateInterviewRequest): Observable<Interview> {
    return this.apiService.put<Interview>(`${this.apiEndpoint}/${id}`, request).pipe(
      tap(interview => this.currentInterview.next(interview)),
      catchError(error => {
        console.error('Failed to update interview:', error);
        throw error;
      })
    );
  }

  /**
   * Monitor video quality metrics
   * @param sessionId Video session identifier
   */
  private monitorQuality(sessionId: string): void {
    this.videoService.getStreamQuality().pipe(
      debounceTime(2000)
    ).subscribe({
      next: (quality) => {
        this.qualityMetrics.next(quality);
        if (quality.status === 'poor') {
          console.warn('Poor video quality detected:', quality.metrics);
        }
      },
      error: (error) => {
        console.error('Failed to monitor quality:', error);
      }
    });

    this.videoService.getDiagnostics().subscribe({
      next: (diagnostics) => {
        if (diagnostics.errors.length > 0) {
          console.error('Video session diagnostics:', diagnostics);
        }
      },
      error: (error) => {
        console.error('Failed to get diagnostics:', error);
      }
    });
  }

  /**
   * Initialize network status monitoring
   */
  private initializeNetworkMonitoring(): void {
    this.videoService.getSessionStatus().subscribe({
      next: (status) => {
        if (status === InterviewStatus.COMPLETED) {
          this.currentInterview.next(null);
        }
      },
      error: (error) => {
        console.error('Failed to monitor session status:', error);
      }
    });
  }
}