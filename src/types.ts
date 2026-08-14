export type Role = "user" | "assistant";

export type Msg = {
  role: Role;
  content: string;
};
