export interface Squad {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HydratedSquad extends Omit<Squad, 'memberIds'> {
  members: SquadMember[];
}

export interface SquadMember {
  name: string;
  venmoId?: string;
  email?: string;
  phoneNumber?: string;
  id?: string; // Optional resolved User ID
}

export interface CreateSquadInput {
  name: string;
  description?: string;
  members: SquadMember[];
}

export interface UpdateSquadInput {
  name?: string;
  description?: string;
  members?: SquadMember[];
}
