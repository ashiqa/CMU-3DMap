import React from 'react';
import { ArrowUpDown, Baby, BookOpen, DoorOpen, Dumbbell, FlaskConical, Footprints, Presentation, Printer, ShoppingBag, Sofa, Toilet, Users, Utensils } from 'lucide-react';
import { RoomKind } from '@/Interfaces';

type Icon = React.ComponentType<{ className?: string }>;

/** Lucide icon for each room kind (floor-view chips and the floor directory). */
export const ROOM_ICON: Record<RoomKind, Icon> = {
  Restroom: Toilet,
  Lactation: Baby,
  Elevator: ArrowUpDown,
  Stairs: Footprints,
  Cafe: Utensils,
  Meeting: Users,
  Classroom: Users,
  Lab: FlaskConical,
  Assembly: Presentation,
  Athletics: Dumbbell,
  Lounge: Sofa,
  Study: BookOpen,
  Retail: ShoppingBag,
  Print: Printer,
  Office: DoorOpen,
  Service: DoorOpen,
  Storage: DoorOpen,
  Utility: DoorOpen,
  Stacks: BookOpen,
  Corridor: DoorOpen,
  Lobby: DoorOpen,
};
