export interface IngressToggleProps {
  // Controlled: the panel owns the persisted showIngress option; this component
  // only reflects it and reports clicks.
  visible: boolean;
  onToggle: () => void;
}
