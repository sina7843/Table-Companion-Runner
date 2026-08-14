/**
 * The Table Companion design system, adapted for the application.
 *
 * The CSS under `./tokens`, `./components/css` and `./skins` is a verbatim copy of the
 * approved Claude Design source — it is the visual contract and must not be edited to
 * suit a screen. Everything exported here is a thin typed adapter over those `tc-*`
 * classes: it adds types, accessibility wiring and state, never a visual decision.
 *
 * Import the stylesheet once at the application entry point:
 *   import '@/design-system/styles.css';
 */

export * from './components/types';

export { Icon, type IconProps, type IconWeight } from './components/Icon';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonVariant,
  type IconButtonProps,
} from './components/Button';
export {
  Field,
  TextInput,
  Textarea,
  type FieldProps,
  type TextInputProps,
  type TextareaProps,
} from './components/Input';
export {
  Tabs,
  TabPanel,
  type TabsProps,
  type TabItem,
  type TabPanelProps,
} from './components/Tabs';
export {
  Badge,
  Chip,
  Tag,
  type BadgeProps,
  type ChipProps,
  type TagProps,
} from './components/Badge';
export {
  Modal,
  Drawer,
  Tooltip,
  type ModalProps,
  type DrawerProps,
  type TooltipProps,
} from './components/Overlay';
export {
  Alert,
  Skeleton,
  Toast,
  ToastViewport,
  ConnectionStatus,
  EmptyState,
  type AlertProps,
  type SkeletonProps,
  type ToastProps,
  type ConnectionStatusProps,
  type EmptyStateProps,
} from './components/Feedback';
export {
  SectionHeader,
  ListRow,
  Table,
  type SectionHeaderProps,
  type ListRowProps,
  type TableProps,
  type TableColumn,
} from './components/DataDisplay';
export {
  Sidebar,
  SidebarGroup,
  NavItem,
  BottomNav,
  type SidebarProps,
  type SidebarGroupProps,
  type NavItemProps,
  type BottomNavProps,
  type BottomNavItemSpec,
} from './components/Navigation';
export { SidePanel, Panel, type SidePanelProps, type PanelProps } from './components/Panel';
export { Stat, StatGrid, type StatProps, type StatGridProps } from './components/Stat';
export {
  HPBar,
  HPDelta,
  HPControl,
  type HPBarProps,
  type HPDeltaProps,
  type HPControlProps,
} from './components/HitPoints';
export {
  ConditionChip,
  DiceButton,
  RollResult,
  TurnIndicator,
  RoundCounter,
  type ConditionChipProps,
  type ConditionTone,
  type DiceButtonProps,
  type RollResultProps,
} from './components/Combat';
