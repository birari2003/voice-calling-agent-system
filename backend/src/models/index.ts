import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import type {
  ConversationContext,
  ConversationState,
  Language,
  QuestionnaireContent,
} from '../ai/types.js';

export class Organization extends Model {
  declare id: number;
  declare name: string;
  declare code: string;
  declare isActive: boolean;
}

Organization.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    code: { type: DataTypes.STRING(40), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, field: 'is_active' },
  },
  { sequelize, tableName: 'organizations', underscored: true, timestamps: true },
);

export class Role extends Model {
  declare id: number;
  declare name: string;
  declare permissions?: Permission[];
}

Role.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(40), allowNull: false },
  },
  { sequelize, tableName: 'roles', underscored: true, timestamps: true },
);

export class Permission extends Model {
  declare id: number;
  declare name: string;
}

Permission.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
  },
  { sequelize, tableName: 'permissions', underscored: true, timestamps: true },
);

export class RolePermission extends Model {
  declare roleId: number;
  declare permissionId: number;
}

RolePermission.init(
  {
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, field: 'role_id' },
    permissionId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, field: 'permission_id' },
  },
  { sequelize, tableName: 'role_permissions', timestamps: false },
);

export class User extends Model {
  declare id: number;
  declare organizationId: number;
  declare roleId: number;
  declare name: string;
  declare email: string;
  declare phone: string | null;
  declare passwordHash: string;
  declare isActive: boolean;
  declare lastLoginAt: Date | null;
  declare role?: Role;
  declare organization?: Organization;
}

User.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'role_id' },
    name: { type: DataTypes.STRING(160), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, field: 'is_active' },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
  },
  { sequelize, tableName: 'users', underscored: true, timestamps: true },
);

export class AuthSession extends Model {
  declare id: number;
  declare userId: number;
  declare tokenHash: string;
  declare expiresAt: Date;
}

AuthSession.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  },
  { sequelize, tableName: 'auth_sessions', underscored: true, timestamps: true },
);

export class AuditLog extends Model {
  declare id: number;
  declare userId: number | null;
  declare action: string;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: Date;
}

export class Citizen extends Model {
  declare id: number;
  declare organizationId: number;
  declare fullName: string | null;
  declare phone: string | null;
  declare whatsappNumber: string | null;
  declare preferredLanguage: 'as' | 'hi' | 'en';
  declare locality: string | null;
  declare ward: string | null;
  declare contactAuthorized: boolean;
  declare consentSource: string | null;
  declare consentRecordedAt: Date | null;
  declare optedOut: boolean;
  declare optedOutAt: Date | null;
  declare isActive: boolean;
  declare notes: string | null;
  declare createdBy: number;
  declare updatedBy: number | null;
  declare deactivatedAt: Date | null;
}

export type ComplaintStatus =
  'registered' | 'acknowledged' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'urgent';

export class Complaint extends Model {
  declare id: number;
  declare ticketId: string;
  declare organizationId: number;
  declare citizenId: number;
  declare category: string;
  declare description: string;
  declare locality: string;
  declare ward: string | null;
  declare landmark: string | null;
  declare locationVerified: boolean;
  declare priority: ComplaintPriority;
  declare status: ComplaintStatus;
  declare assignedTo: number | null;
  declare assignedDepartment: string | null;
  declare source: 'staff' | 'simulated_ai';
  declare sourceSessionId: string | null;
  declare citizenConfirmed: boolean;
  declare citizenConfirmedAt: Date | null;
  declare idempotencyKey: string | null;
  declare requestHash: string | null;
  declare createdBy: number;
  declare archivedAt: Date | null;
  declare citizen?: Citizen;
  declare assignedUser?: User;
  declare creator?: User;
  declare statusHistory?: ComplaintStatusHistory[];
  declare notes?: ComplaintNote[];
}

Complaint.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    ticketId: { type: DataTypes.STRING(32), allowNull: false, unique: true, field: 'ticket_id' },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    citizenId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'citizen_id' },
    category: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    locality: { type: DataTypes.STRING(160), allowNull: false },
    ward: { type: DataTypes.STRING(40), allowNull: true },
    landmark: { type: DataTypes.STRING(160), allowNull: true },
    locationVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'location_verified',
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    status: {
      type: DataTypes.ENUM(
        'registered',
        'acknowledged',
        'assigned',
        'in_progress',
        'resolved',
        'closed',
        'reopened',
      ),
      allowNull: false,
      defaultValue: 'registered',
    },
    assignedTo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'assigned_to' },
    assignedDepartment: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'assigned_department',
    },
    source: {
      type: DataTypes.ENUM('staff', 'simulated_ai'),
      allowNull: false,
      defaultValue: 'staff',
    },
    sourceSessionId: { type: DataTypes.STRING(36), allowNull: true, field: 'source_session_id' },
    citizenConfirmed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'citizen_confirmed',
    },
    citizenConfirmedAt: { type: DataTypes.DATE, allowNull: true, field: 'citizen_confirmed_at' },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, field: 'idempotency_key' },
    requestHash: { type: DataTypes.STRING(64), allowNull: true, field: 'request_hash' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'created_by' },
    archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
  },
  { sequelize, tableName: 'complaints', underscored: true, timestamps: true },
);

export class ComplaintStatusHistory extends Model {
  declare id: number;
  declare complaintId: number;
  declare fromStatus: ComplaintStatus | null;
  declare toStatus: ComplaintStatus;
  declare changedBy: number;
  declare note: string | null;
  declare changedAt: Date;
  declare changedByUser?: User;
}

ComplaintStatusHistory.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    complaintId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'complaint_id' },
    fromStatus: { type: DataTypes.STRING(30), allowNull: true, field: 'from_status' },
    toStatus: { type: DataTypes.STRING(30), allowNull: false, field: 'to_status' },
    changedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'changed_by' },
    note: { type: DataTypes.STRING(500), allowNull: true },
    changedAt: { type: DataTypes.DATE, allowNull: false, field: 'changed_at' },
  },
  { sequelize, tableName: 'complaint_status_history', underscored: true, timestamps: false },
);

export class ComplaintNote extends Model {
  declare id: number;
  declare complaintId: number;
  declare authorId: number;
  declare body: string;
  declare createdAt: Date;
  declare author?: User;
}

ComplaintNote.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    complaintId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'complaint_id' },
    authorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'author_id' },
    body: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'complaint_notes', underscored: true, timestamps: false },
);

Citizen.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    fullName: { type: DataTypes.STRING(160), allowNull: true, field: 'full_name' },
    phone: { type: DataTypes.STRING(16), allowNull: true },
    whatsappNumber: { type: DataTypes.STRING(16), allowNull: true, field: 'whatsapp_number' },
    preferredLanguage: {
      type: DataTypes.ENUM('as', 'hi', 'en'),
      allowNull: false,
      defaultValue: 'as',
      field: 'preferred_language',
    },
    locality: { type: DataTypes.STRING(160), allowNull: true },
    ward: { type: DataTypes.STRING(40), allowNull: true },
    contactAuthorized: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'contact_authorized',
    },
    consentSource: { type: DataTypes.STRING(120), allowNull: true, field: 'consent_source' },
    consentRecordedAt: { type: DataTypes.DATE, allowNull: true, field: 'consent_recorded_at' },
    optedOut: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'opted_out',
    },
    optedOutAt: { type: DataTypes.DATE, allowNull: true, field: 'opted_out_at' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'created_by' },
    updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'updated_by' },
    deactivatedAt: { type: DataTypes.DATE, allowNull: true, field: 'deactivated_at' },
  },
  { sequelize, tableName: 'citizens', underscored: true, timestamps: true },
);

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'user_id' },
    action: { type: DataTypes.STRING(80), allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'audit_logs', underscored: true, timestamps: false },
);

export class QuestionnaireVersion extends Model {
  declare id: number;
  declare organizationId: number;
  declare version: number;
  declare languageContent: QuestionnaireContent;
  declare isActive: boolean;
  declare createdBy: number | null;
  declare createdAt: Date;
}

QuestionnaireVersion.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    languageContent: { type: DataTypes.JSON, allowNull: false, field: 'language_content' },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_active',
    },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'created_by' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'questionnaire_versions', underscored: true, timestamps: false },
);

export type SessionStatus = 'active' | 'ended';
export type SessionOutcome =
  | 'complaint_created'
  | 'cancelled_by_citizen'
  | 'cancelled_by_staff'
  | 'handoff'
  | 'ended_without_complaint';

export class CallSession extends Model {
  declare id: string;
  declare organizationId: number;
  declare citizenId: number | null;
  declare campaignId: number | null;
  declare campaignRecipientId: number | null;
  declare questionnaireVersionId: number;
  declare mode: 'simulation' | 'telephony';
  declare channel: 'text' | 'voice';
  declare provider: string;
  declare providerSessionId: string | null;
  declare dialogueEngine: string;
  declare status: SessionStatus;
  declare conversationState: ConversationState;
  declare conversationContext: ConversationContext;
  declare language: Language | null;
  declare outcome: SessionOutcome | null;
  declare complaintId: number | null;
  declare confirmedAt: Date | null;
  declare recordingStorageKey: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;
  declare startedBy: number;
  declare startedAt: Date;
  declare endedAt: Date | null;
  declare durationSeconds: number | null;
  declare createdAt: Date;
  declare citizen?: Citizen;
  declare starter?: User;
  declare complaint?: Complaint;
  declare messages?: SessionMessage[];
}

CallSession.init(
  {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    citizenId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'citizen_id' },
    campaignId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'campaign_id' },
    campaignRecipientId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'campaign_recipient_id',
    },
    questionnaireVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'questionnaire_version_id',
    },
    mode: {
      type: DataTypes.ENUM('simulation', 'telephony'),
      allowNull: false,
      defaultValue: 'simulation',
    },
    channel: { type: DataTypes.ENUM('text', 'voice'), allowNull: false, defaultValue: 'text' },
    provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'local' },
    providerSessionId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'provider_session_id',
    },
    dialogueEngine: { type: DataTypes.STRING(60), allowNull: false, field: 'dialogue_engine' },
    status: { type: DataTypes.ENUM('active', 'ended'), allowNull: false, defaultValue: 'active' },
    conversationState: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'conversation_state',
    },
    conversationContext: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'conversation_context',
    },
    language: { type: DataTypes.ENUM('as', 'hi', 'en'), allowNull: true },
    outcome: {
      type: DataTypes.ENUM(
        'complaint_created',
        'cancelled_by_citizen',
        'cancelled_by_staff',
        'handoff',
        'ended_without_complaint',
      ),
      allowNull: true,
    },
    complaintId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'complaint_id' },
    confirmedAt: { type: DataTypes.DATE, allowNull: true, field: 'confirmed_at' },
    recordingStorageKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'recording_storage_key',
    },
    errorCode: { type: DataTypes.STRING(60), allowNull: true, field: 'error_code' },
    errorMessage: { type: DataTypes.STRING(500), allowNull: true, field: 'error_message' },
    startedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'started_by' },
    startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
    endedAt: { type: DataTypes.DATE, allowNull: true, field: 'ended_at' },
    durationSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'duration_seconds',
    },
  },
  { sequelize, tableName: 'call_sessions', underscored: true, timestamps: true },
);

export class SessionMessage extends Model {
  declare id: number;
  declare sessionId: string;
  declare sequenceNumber: number;
  declare speaker: 'citizen' | 'assistant' | 'system';
  declare messageText: string;
  declare language: Language | null;
  declare conversationState: ConversationState;
  declare confidence: number | null;
  declare clientMessageId: string | null;
  declare createdAt: Date;
}

SessionMessage.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    sessionId: { type: DataTypes.CHAR(36), allowNull: false, field: 'session_id' },
    sequenceNumber: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'sequence_number',
    },
    speaker: { type: DataTypes.ENUM('citizen', 'assistant', 'system'), allowNull: false },
    messageText: { type: DataTypes.TEXT, allowNull: false, field: 'message_text' },
    language: { type: DataTypes.ENUM('as', 'hi', 'en'), allowNull: true },
    conversationState: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'conversation_state',
    },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    clientMessageId: { type: DataTypes.STRING(64), allowNull: true, field: 'client_message_id' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'session_messages', underscored: true, timestamps: false },
);

export class UploadToken extends Model {
  declare id: number;
  declare organizationId: number;
  declare complaintId: number;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare maxUploads: number;
  declare uploadCount: number;
  declare revokedAt: Date | null;
  declare revokedBy: number | null;
  declare createdBy: number;
  declare createdAt: Date;
  declare creator?: User;
}

UploadToken.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    complaintId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'complaint_id' },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    maxUploads: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'max_uploads' },
    uploadCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'upload_count',
    },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
    revokedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'revoked_by' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'created_by' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'upload_tokens', underscored: true, timestamps: false },
);

export type AttachmentSource = 'dashboard' | 'upload_link' | 'whatsapp';

export class ComplaintAttachment extends Model {
  declare id: number;
  declare organizationId: number;
  declare complaintId: number;
  declare uploadedByUserId: number | null;
  declare uploadTokenId: number | null;
  declare source: AttachmentSource;
  declare originalFilename: string;
  declare storageKey: string;
  declare mimeType: string;
  declare fileSize: number;
  declare checksum: string;
  declare createdAt: Date;
  declare uploader?: User;
}

ComplaintAttachment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    complaintId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'complaint_id' },
    uploadedByUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'uploaded_by_user_id',
    },
    uploadTokenId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'upload_token_id' },
    source: { type: DataTypes.ENUM('dashboard', 'upload_link', 'whatsapp'), allowNull: false },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_filename',
    },
    storageKey: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      field: 'storage_key',
    },
    mimeType: { type: DataTypes.STRING(60), allowNull: false, field: 'mime_type' },
    fileSize: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'file_size' },
    checksum: { type: DataTypes.CHAR(64), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  { sequelize, tableName: 'complaint_attachments', underscored: true, timestamps: false },
);

export type CampaignStatus =
  'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export interface CampaignTargetFilter {
  wards?: string[];
  locality?: string;
  language?: Language;
}

export class Campaign extends Model {
  declare id: number;
  declare organizationId: number;
  declare name: string;
  declare description: string | null;
  declare status: CampaignStatus;
  declare questionnaireVersionId: number | null;
  declare defaultLanguage: Language | null;
  declare channel: 'text' | 'voice';
  declare targetFilter: CampaignTargetFilter;
  declare maxAttempts: number;
  declare createdBy: number;
  declare scheduledAt: Date | null;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare cancelledAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare creator?: User;
}

Campaign.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'organization_id',
    },
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'ready',
        'running',
        'paused',
        'completed',
        'cancelled',
        'failed',
      ),
      allowNull: false,
      defaultValue: 'draft',
    },
    questionnaireVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'questionnaire_version_id',
    },
    defaultLanguage: {
      type: DataTypes.ENUM('as', 'hi', 'en'),
      allowNull: true,
      field: 'default_language',
    },
    channel: { type: DataTypes.ENUM('text', 'voice'), allowNull: false, defaultValue: 'text' },
    targetFilter: { type: DataTypes.JSON, allowNull: false, field: 'target_filter' },
    maxAttempts: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      field: 'max_attempts',
    },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'created_by' },
    scheduledAt: { type: DataTypes.DATE, allowNull: true, field: 'scheduled_at' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    cancelledAt: { type: DataTypes.DATE, allowNull: true, field: 'cancelled_at' },
  },
  { sequelize, tableName: 'campaigns', underscored: true, timestamps: true },
);

export type RecipientStatus =
  'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'opted_out';
export type ExclusionReason =
  'opted_out' | 'inactive' | 'missing_authorization' | 'invalid_number' | 'duplicate';

export class CampaignRecipient extends Model {
  declare id: number;
  declare campaignId: number;
  declare citizenId: number;
  declare status: RecipientStatus;
  declare exclusionReason: ExclusionReason | null;
  declare attemptCount: number;
  declare lastAttemptAt: Date | null;
  declare lastSessionId: string | null;
  declare citizen?: Citizen;
  declare lastSession?: CallSession;
}

CampaignRecipient.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    campaignId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'campaign_id' },
    citizenId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'citizen_id' },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped', 'opted_out'),
      allowNull: false,
      defaultValue: 'pending',
    },
    exclusionReason: {
      type: DataTypes.ENUM(
        'opted_out',
        'inactive',
        'missing_authorization',
        'invalid_number',
        'duplicate',
      ),
      allowNull: true,
      field: 'exclusion_reason',
    },
    attemptCount: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'attempt_count',
    },
    lastAttemptAt: { type: DataTypes.DATE, allowNull: true, field: 'last_attempt_at' },
    lastSessionId: { type: DataTypes.CHAR(36), allowNull: true, field: 'last_session_id' },
  },
  { sequelize, tableName: 'campaign_recipients', underscored: true, timestamps: true },
);

User.belongsTo(Role, { as: 'role', foreignKey: 'roleId' });
User.belongsTo(Organization, { as: 'organization', foreignKey: 'organizationId' });
Role.belongsToMany(Permission, {
  as: 'permissions',
  through: RolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
});
Permission.belongsToMany(Role, {
  as: 'roles',
  through: RolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
});
AuthSession.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(AuthSession, { as: 'sessions', foreignKey: 'userId' });
Complaint.belongsTo(Citizen, { as: 'citizen', foreignKey: 'citizenId' });
Complaint.belongsTo(User, { as: 'assignedUser', foreignKey: 'assignedTo' });
Complaint.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Complaint.hasMany(ComplaintStatusHistory, { as: 'statusHistory', foreignKey: 'complaintId' });
Complaint.hasMany(ComplaintNote, { as: 'notes', foreignKey: 'complaintId' });
ComplaintStatusHistory.belongsTo(User, { as: 'changedByUser', foreignKey: 'changedBy' });
ComplaintNote.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
CallSession.belongsTo(Citizen, { as: 'citizen', foreignKey: 'citizenId' });
CallSession.belongsTo(User, { as: 'starter', foreignKey: 'startedBy' });
CallSession.belongsTo(Complaint, { as: 'complaint', foreignKey: 'complaintId' });
CallSession.hasMany(SessionMessage, { as: 'messages', foreignKey: 'sessionId' });
UploadToken.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
ComplaintAttachment.belongsTo(User, { as: 'uploader', foreignKey: 'uploadedByUserId' });
Complaint.hasMany(ComplaintAttachment, { as: 'attachments', foreignKey: 'complaintId' });
Campaign.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Campaign.hasMany(CampaignRecipient, { as: 'recipients', foreignKey: 'campaignId' });
CampaignRecipient.belongsTo(Citizen, { as: 'citizen', foreignKey: 'citizenId' });
CampaignRecipient.belongsTo(Campaign, { as: 'campaign', foreignKey: 'campaignId' });
CampaignRecipient.belongsTo(CallSession, { as: 'lastSession', foreignKey: 'lastSessionId' });
CallSession.belongsTo(Campaign, { as: 'campaign', foreignKey: 'campaignId' });
