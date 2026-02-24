use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Maximum events in the heap
pub const MAX_EVENTS: usize = 256;

/// Sentinel for empty slots
pub const FREE_SLOT: u16 = u16::MAX;

/// Event types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum EventType {
    /// Order was filled
    Fill = 0,
    /// Order was cancelled/removed
    Out = 1,
}

impl Default for EventType {
    fn default() -> Self {
        EventType::Fill
    }
}

/// Fill event - emitted when orders match
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
#[repr(C)]
pub struct FillEvent {
    /// Event type discriminator
    pub event_type: u8,

    /// Taker side (0 = buy, 1 = sell)
    pub taker_side: u8,

    /// Whether maker order is fully filled
    pub maker_out: u8,

    /// Maker's slot in their open orders
    pub maker_slot: u8,

    /// Padding
    pub _padding: [u8; 4],

    /// Event timestamp
    pub timestamp: i64,

    /// Market sequence number
    pub seq_num: u64,

    /// Maker's position account
    pub maker: Pubkey,

    /// Taker's position account
    pub taker: Pubkey,

    /// Fill price (in basis points)
    pub price: u64,

    /// Fill quantity
    pub quantity: u64,

    /// Maker's client order ID
    pub maker_client_order_id: u64,

    /// Taker's client order ID
    pub taker_client_order_id: u64,

    /// Outcome (0 = Yes, 1 = No)
    pub outcome: u8,

    /// Reserved
    pub _reserved: [u8; 7],
}

impl FillEvent {
    pub const SIZE: usize = 1 + 1 + 1 + 1 + 4 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 7; // 128 bytes

    pub fn new(
        taker_side: u8,
        maker_out: bool,
        maker_slot: u8,
        timestamp: i64,
        seq_num: u64,
        maker: Pubkey,
        taker: Pubkey,
        price: u64,
        quantity: u64,
        maker_client_order_id: u64,
        taker_client_order_id: u64,
        outcome: u8,
    ) -> Self {
        Self {
            event_type: EventType::Fill as u8,
            taker_side,
            maker_out: if maker_out { 1 } else { 0 },
            maker_slot,
            _padding: [0; 4],
            timestamp,
            seq_num,
            maker,
            taker,
            price,
            quantity,
            maker_client_order_id,
            taker_client_order_id,
            outcome,
            _reserved: [0; 7],
        }
    }

    pub fn is_maker_out(&self) -> bool {
        self.maker_out != 0
    }
}

unsafe impl Zeroable for FillEvent {}
unsafe impl Pod for FillEvent {}

/// Out event - emitted when order is removed
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
#[repr(C)]
pub struct OutEvent {
    /// Event type discriminator
    pub event_type: u8,

    /// Side of the cancelled order (0 = buy, 1 = sell)
    pub side: u8,

    /// Owner's slot in their open orders
    pub owner_slot: u8,

    /// Padding
    pub _padding: [u8; 5],

    /// Event timestamp
    pub timestamp: i64,

    /// Sequence number
    pub seq_num: u64,

    /// Owner's position account
    pub owner: Pubkey,

    /// Remaining quantity that was cancelled
    pub quantity: u64,

    /// Reserved padding (split into smaller arrays for Default)
    pub _reserved1: [u8; 32],
    pub _reserved2: [u8; 24],
}

impl Default for OutEvent {
    fn default() -> Self {
        Self {
            event_type: 0,
            side: 0,
            owner_slot: 0,
            _padding: [0; 5],
            timestamp: 0,
            seq_num: 0,
            owner: Pubkey::default(),
            quantity: 0,
            _reserved1: [0; 32],
            _reserved2: [0; 24],
        }
    }
}

unsafe impl Zeroable for OutEvent {}
unsafe impl Pod for OutEvent {}

impl OutEvent {
    pub const SIZE: usize = FillEvent::SIZE; // Same size for union storage

    pub fn new(
        side: u8,
        owner_slot: u8,
        timestamp: i64,
        seq_num: u64,
        owner: Pubkey,
        quantity: u64,
    ) -> Self {
        Self {
            event_type: EventType::Out as u8,
            side,
            owner_slot,
            _padding: [0; 5],
            timestamp,
            seq_num,
            owner,
            quantity,
            _reserved1: [0; 32],
            _reserved2: [0; 24],
        }
    }
}

/// Event node in the heap (linked list node)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
#[repr(C)]
pub struct EventNode {
    /// Next node in list
    pub next: u16,

    /// Previous node in list
    pub prev: u16,

    /// Padding
    pub _padding: [u8; 4],

    /// Event data (Fill or Out) - split for Default compatibility
    pub data1: [u8; 32],
    pub data2: [u8; 32],
    pub data3: [u8; 32],
    pub data4: [u8; 32],
}

impl Default for EventNode {
    fn default() -> Self {
        Self {
            next: FREE_SLOT,
            prev: FREE_SLOT,
            _padding: [0; 4],
            data1: [0; 32],
            data2: [0; 32],
            data3: [0; 32],
            data4: [0; 32],
        }
    }
}

unsafe impl Zeroable for EventNode {}
unsafe impl Pod for EventNode {}

impl EventNode {
    pub const SIZE: usize = 2 + 2 + 4 + FillEvent::SIZE;

    fn data_ptr(&self) -> *const u8 {
        self.data1.as_ptr()
    }

    fn data_mut_ptr(&mut self) -> *mut u8 {
        self.data1.as_mut_ptr()
    }

    pub fn is_free(&self) -> bool {
        self.data1[0] == 0 && self.next == FREE_SLOT && self.prev == FREE_SLOT
    }

    pub fn event_type(&self) -> EventType {
        match self.data1[0] {
            0 => EventType::Fill,
            1 => EventType::Out,
            _ => EventType::Fill,
        }
    }

    pub fn as_fill(&self) -> Option<FillEvent> {
        if self.data1[0] == EventType::Fill as u8 {
            Some(unsafe { std::ptr::read(self.data_ptr() as *const FillEvent) })
        } else {
            None
        }
    }

    pub fn as_out(&self) -> Option<OutEvent> {
        if self.data1[0] == EventType::Out as u8 {
            Some(unsafe { std::ptr::read(self.data_ptr() as *const OutEvent) })
        } else {
            None
        }
    }

    pub fn set_fill(&mut self, event: &FillEvent) {
        unsafe {
            std::ptr::write(self.data_mut_ptr() as *mut FillEvent, *event);
        }
    }

    pub fn set_out(&mut self, event: &OutEvent) {
        unsafe {
            std::ptr::write(self.data_mut_ptr() as *mut OutEvent, *event);
        }
    }
}

/// Event heap for storing fill and out events
#[account(zero_copy)]
#[repr(C)]
pub struct EventHeap {
    /// Head of used list (oldest event)
    pub used_head: u16,

    /// Tail of used list (newest event)
    pub used_tail: u16,

    /// Head of free list
    pub free_head: u16,

    /// Number of events in the heap
    pub count: u16,

    /// Sequence number for events
    pub seq_num: u64,

    /// Reserved (split for Zeroable)
    pub _reserved1: [u8; 32],
    pub _reserved2: [u8; 24],

    /// Event nodes
    pub nodes: [EventNode; MAX_EVENTS],
}

#[cfg(test)]
impl Default for EventHeap {
    fn default() -> Self {
        Self {
            used_head: FREE_SLOT,
            used_tail: FREE_SLOT,
            free_head: 0,
            count: 0,
            seq_num: 0,
            _reserved1: [0; 32],
            _reserved2: [0; 24],
            nodes: core::array::from_fn(|_| EventNode::default()),
        }
    }
}

impl EventHeap {
    pub const SIZE: usize = 2 + 2 + 2 + 2 + 8 + 56 + (EventNode::SIZE * MAX_EVENTS);

    /// Initialize the event heap
    pub fn initialize(&mut self) {
        self.used_head = FREE_SLOT;
        self.used_tail = FREE_SLOT;
        self.count = 0;
        self.seq_num = 0;

        // Initialize free list
        for i in 0..MAX_EVENTS {
            self.nodes[i].next = if i + 1 < MAX_EVENTS {
                (i + 1) as u16
            } else {
                FREE_SLOT
            };
            self.nodes[i].prev = FREE_SLOT;
        }
        self.free_head = 0;
    }

    /// Check if heap is full
    pub fn is_full(&self) -> bool {
        self.free_head == FREE_SLOT
    }

    /// Check if heap is empty
    pub fn is_empty(&self) -> bool {
        self.used_head == FREE_SLOT
    }

    /// Get number of events
    pub fn len(&self) -> usize {
        self.count as usize
    }

    /// Push a fill event
    pub fn push_fill(&mut self, event: FillEvent) -> Option<u16> {
        let slot = self.allocate_slot()?;

        self.nodes[slot as usize].set_fill(&event);

        // Add to used list tail
        self.nodes[slot as usize].prev = self.used_tail;
        self.nodes[slot as usize].next = FREE_SLOT;

        if self.used_tail != FREE_SLOT {
            self.nodes[self.used_tail as usize].next = slot;
        }
        self.used_tail = slot;

        if self.used_head == FREE_SLOT {
            self.used_head = slot;
        }

        self.count += 1;
        Some(slot)
    }

    /// Push an out event
    pub fn push_out(&mut self, event: OutEvent) -> Option<u16> {
        let slot = self.allocate_slot()?;

        self.nodes[slot as usize].set_out(&event);

        // Add to used list tail
        self.nodes[slot as usize].prev = self.used_tail;
        self.nodes[slot as usize].next = FREE_SLOT;

        if self.used_tail != FREE_SLOT {
            self.nodes[self.used_tail as usize].next = slot;
        }
        self.used_tail = slot;

        if self.used_head == FREE_SLOT {
            self.used_head = slot;
        }

        self.count += 1;
        Some(slot)
    }

    /// Allocate a slot from the free list
    fn allocate_slot(&mut self) -> Option<u16> {
        if self.free_head == FREE_SLOT {
            return None;
        }

        let slot = self.free_head;
        self.free_head = self.nodes[slot as usize].next;
        self.nodes[slot as usize].next = FREE_SLOT;
        self.nodes[slot as usize].prev = FREE_SLOT;

        Some(slot)
    }

    /// Pop the oldest event (from head)
    pub fn pop(&mut self) -> Option<(u16, EventNode)> {
        if self.used_head == FREE_SLOT {
            return None;
        }

        let slot = self.used_head;
        let node = self.nodes[slot as usize];

        // Remove from used list
        self.used_head = node.next;
        if self.used_head != FREE_SLOT {
            self.nodes[self.used_head as usize].prev = FREE_SLOT;
        } else {
            self.used_tail = FREE_SLOT;
        }

        // Add to free list
        self.nodes[slot as usize] = EventNode::default();
        self.nodes[slot as usize].next = self.free_head;
        self.free_head = slot;

        self.count = self.count.saturating_sub(1);

        Some((slot, node))
    }

    /// Delete a specific slot
    pub fn delete_slot(&mut self, slot: u16) -> Option<EventNode> {
        if slot as usize >= MAX_EVENTS {
            return None;
        }

        let node = self.nodes[slot as usize];
        if node.is_free() {
            return None;
        }

        // Unlink from used list
        if node.prev != FREE_SLOT {
            self.nodes[node.prev as usize].next = node.next;
        } else {
            self.used_head = node.next;
        }

        if node.next != FREE_SLOT {
            self.nodes[node.next as usize].prev = node.prev;
        } else {
            self.used_tail = node.prev;
        }

        // Add to free list
        self.nodes[slot as usize] = EventNode::default();
        self.nodes[slot as usize].next = self.free_head;
        self.free_head = slot;

        self.count = self.count.saturating_sub(1);

        Some(node)
    }

    /// Get event at slot
    pub fn at(&self, slot: u16) -> Option<&EventNode> {
        if slot as usize >= MAX_EVENTS {
            return None;
        }
        let node = &self.nodes[slot as usize];
        if node.is_free() {
            return None;
        }
        Some(node)
    }

    /// Iterate over events from oldest to newest
    pub fn iter(&self) -> EventHeapIterator<'_> {
        EventHeapIterator {
            heap: self,
            current: self.used_head,
        }
    }
}

/// Iterator over event heap
pub struct EventHeapIterator<'a> {
    heap: &'a EventHeap,
    current: u16,
}

impl<'a> Iterator for EventHeapIterator<'a> {
    type Item = (u16, &'a EventNode);

    fn next(&mut self) -> Option<Self::Item> {
        if self.current == FREE_SLOT {
            return None;
        }

        let slot = self.current;
        let node = &self.heap.nodes[slot as usize];
        self.current = node.next;

        Some((slot, node))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_heap_push_pop() {
        let mut heap = EventHeap::default();
        heap.initialize();

        assert!(heap.is_empty());

        let fill = FillEvent::new(
            0,                    // taker_side
            false,                // maker_out
            0,                    // maker_slot
            1000,                 // timestamp
            1,                    // seq_num
            Pubkey::new_unique(), // maker
            Pubkey::new_unique(), // taker
            5000,                 // price
            100,                  // quantity
            1,                    // maker_client_order_id
            2,                    // taker_client_order_id
            0,                    // outcome (Yes)
        );

        heap.push_fill(fill);
        assert_eq!(heap.len(), 1);
        assert!(!heap.is_empty());

        let (_, node) = heap.pop().unwrap();
        assert_eq!(node.event_type(), EventType::Fill);

        let fill_data = node.as_fill().unwrap();
        assert_eq!(fill_data.price, 5000);
        assert_eq!(fill_data.quantity, 100);

        assert!(heap.is_empty());
    }

    #[test]
    fn test_event_heap_fifo() {
        let mut heap = EventHeap::default();
        heap.initialize();

        // Push 3 events
        for i in 0..3 {
            let fill = FillEvent::new(
                0,
                false,
                0,
                i as i64,
                i as u64,
                Pubkey::new_unique(),
                Pubkey::new_unique(),
                5000 + i as u64,
                100,
                i as u64,
                i as u64,
                0,
            );
            heap.push_fill(fill);
        }

        // Pop should return in FIFO order
        for i in 0..3 {
            let (_, node) = heap.pop().unwrap();
            let fill = node.as_fill().unwrap();
            assert_eq!(fill.price, 5000 + i as u64);
        }
    }

    #[test]
    fn test_event_heap_out_event() {
        let mut heap = EventHeap::default();
        heap.initialize();

        let out = OutEvent::new(
            1,                    // side (sell)
            5,                    // owner_slot
            2000,                 // timestamp
            10,                   // seq_num
            Pubkey::new_unique(), // owner
            50,                   // quantity
        );

        heap.push_out(out);

        let (_, node) = heap.pop().unwrap();
        assert_eq!(node.event_type(), EventType::Out);

        let out_data = node.as_out().unwrap();
        assert_eq!(out_data.quantity, 50);
        assert_eq!(out_data.owner_slot, 5);
    }
}
