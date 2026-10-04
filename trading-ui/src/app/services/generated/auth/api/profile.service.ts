import { Injectable, Inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserResponse } from '../../../../api/generated/auth/model/user-response';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  getCurrentUser(): Observable<UserResponse> {
    // Return a mock user response for the UI
    return new Observable<UserResponse>(observer => {
      observer.next({
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1-555-1234',
        role: 'CUSTOMER',
        roles: ['CUSTOMER'],
        accountId: 123,
        joiningDate: new Date().toISOString()
      });
      observer.complete();
    });
  }
}
