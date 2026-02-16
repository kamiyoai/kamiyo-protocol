export type SwarmTeamMember = {
  id: string;
  agentId: string;
  role: string;
  drawLimit: number;
};

export type SwarmDagNodeInput = {
  id: string;
  memberId: string;
  description: string;
  budget?: number;
  dependsOn?: string[];
};

export type SwarmDagNode = {
  id: string;
  memberId: string;
  description: string;
  budget: number;
  dependsOn: string[];
};

export type SwarmDagPlan = {
  mode: 'dag';
  nodes: SwarmDagNode[];
};

