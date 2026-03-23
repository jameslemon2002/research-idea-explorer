import { buildIdeaSignature } from "../schema.js";

export function markVisited(state, idea) {
  const signature = buildIdeaSignature(idea);
  if (!state.visitedSignatures.includes(signature)) {
    state.visitedSignatures.push(signature);
    state.history.push({ ideaId: idea.id, decision: "visited" });
  }
  return state;
}

export function acceptIdea(state, idea) {
  markVisited(state, idea);
  if (!state.acceptedIdeas.includes(idea.id)) {
    state.acceptedIdeas.push(idea.id);
    state.history.push({ ideaId: idea.id, decision: "accepted" });
  }
  return state;
}

export function rejectIdea(state, idea) {
  markVisited(state, idea);
  if (!state.rejectedIdeas.includes(idea.id)) {
    state.rejectedIdeas.push(idea.id);
    state.history.push({ ideaId: idea.id, decision: "rejected" });
  }
  return state;
}

export function isVisited(state, idea) {
  return state.visitedSignatures.includes(buildIdeaSignature(idea));
}

export function updateFrontier(state, ideas) {
  state.frontier = ideas.map((idea) => idea.id);
  return state;
}

