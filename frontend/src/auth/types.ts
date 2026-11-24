export interface AuthUser {
  id: number;
  name: string;
  email: string;
  organizationId: number;
  organizationName: string;
  role: string;
  permissions: string[];
}
