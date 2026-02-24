use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Maximum orders per side of the orderbook
pub const MAX_ORDERS: usize = 512;

/// Maximum events in the event heap
pub const MAX_EVENTS: usize = 256;

/// Price scale for basis points (10000 = 100%)
pub const PRICE_SCALE: u64 = 10000;

/// Maximum quantity per order (1 billion units)
pub const MAX_ORDER_QUANTITY: u64 = 1_000_000_000;

/// Node handle type for tree indices
pub type NodeHandle = u32;

/// Sentinel value for empty nodes
pub const FREE_NODE: NodeHandle = u32::MAX;

/// Order tree node - stored in BookSide
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
#[repr(C)]
pub struct OrderNode {
    /// Order key: (price << 64) | sequence_number
    pub key: u128,

    /// Owner's position account
    pub owner: Pubkey,

    /// Quantity remaining
    pub quantity: u64,

    /// Client-provided order ID
    pub client_order_id: u64,

    /// Timestamp when order was placed
    pub timestamp: i64,

    /// Slot for the owner's open orders array
    pub owner_slot: u8,

    /// Padding for alignment before u32 fields
    pub _pad1: [u8; 3],

    /// Tree links: parent, left child, right child
    pub parent: NodeHandle,
    pub left: NodeHandle,
    pub right: NodeHandle,

    /// Color for red-black tree (0 = black, 1 = red)
    pub color: u8,

    /// Padding for alignment
    pub _padding: [u8; 3],
}

unsafe impl Zeroable for OrderNode {}
unsafe impl Pod for OrderNode {}

impl OrderNode {
    pub const SIZE: usize = 16 + 32 + 8 + 8 + 8 + 1 + 4 + 4 + 4 + 1 + 2; // 88 bytes

    pub fn price(&self) -> u64 {
        (self.key >> 64) as u64
    }

    pub fn seq_num(&self) -> u64 {
        self.key as u64
    }

    pub fn is_free(&self) -> bool {
        self.key == 0 && self.owner == Pubkey::default()
    }
}

/// BookSide holds one side of the orderbook (bids or asks)
#[account(zero_copy)]
#[repr(C)]
pub struct BookSide {
    /// Root node index (FREE_NODE if empty)
    pub root: NodeHandle,

    /// Best price node index (cached for O(1) access)
    pub best: NodeHandle,

    /// Number of orders in the tree
    pub order_count: u32,

    /// Head of free list
    pub free_list_head: NodeHandle,

    /// Sequence number for order priority
    pub seq_num: u64,

    /// 1 = bids (buy), 0 = asks (sell)
    pub is_bids: u8,

    /// Padding
    pub _padding: [u8; 7],

    /// Reserved for future use
    pub _reserved: [u8; 64],

    /// Order nodes array
    pub nodes: [OrderNode; MAX_ORDERS],
}

impl Default for BookSide {
    fn default() -> Self {
        Self {
            root: FREE_NODE,
            best: FREE_NODE,
            order_count: 0,
            free_list_head: 0,
            seq_num: 0,
            is_bids: 0,
            _padding: [0; 7],
            _reserved: [0; 64],
            nodes: [OrderNode::default(); MAX_ORDERS],
        }
    }
}

impl BookSide {
    pub const SIZE: usize = 4 + 4 + 4 + 4 + 8 + 1 + 7 + 64 + (OrderNode::SIZE * MAX_ORDERS);

    /// Initialize the bookside with a free list
    pub fn initialize(&mut self, is_bids: bool) {
        self.root = FREE_NODE;
        self.best = FREE_NODE;
        self.order_count = 0;
        self.seq_num = 0;
        self.is_bids = if is_bids { 1 } else { 0 };

        // Initialize free list: each node points to the next
        for i in 0..MAX_ORDERS {
            self.nodes[i].parent = if i + 1 < MAX_ORDERS {
                (i + 1) as NodeHandle
            } else {
                FREE_NODE
            };
        }
        self.free_list_head = 0;
    }

    /// Allocate a node from the free list
    fn allocate_node(&mut self) -> Option<NodeHandle> {
        if self.free_list_head == FREE_NODE {
            return None;
        }
        let index = self.free_list_head;
        self.free_list_head = self.nodes[index as usize].parent;
        self.nodes[index as usize] = OrderNode::default();
        Some(index)
    }

    /// Return a node to the free list
    fn deallocate_node(&mut self, index: NodeHandle) {
        self.nodes[index as usize] = OrderNode::default();
        self.nodes[index as usize].parent = self.free_list_head;
        self.free_list_head = index;
    }

    /// Create order key from price and sequence number
    pub fn make_key(&mut self, price: u64) -> u128 {
        let seq = self.seq_num;
        self.seq_num += 1;

        if self.is_bids == 1 {
            // For bids: higher prices first, then earlier orders
            // Invert sequence for FIFO within same price
            ((price as u128) << 64) | (!seq as u128)
        } else {
            // For asks: lower prices first, then earlier orders
            ((price as u128) << 64) | (seq as u128)
        }
    }

    /// Insert an order into the tree
    pub fn insert(
        &mut self,
        price: u64,
        quantity: u64,
        owner: Pubkey,
        client_order_id: u64,
        timestamp: i64,
        owner_slot: u8,
    ) -> Option<(NodeHandle, u128)> {
        let index = self.allocate_node()?;
        let key = self.make_key(price);

        let node = &mut self.nodes[index as usize];
        node.key = key;
        node.owner = owner;
        node.quantity = quantity;
        node.client_order_id = client_order_id;
        node.timestamp = timestamp;
        node.owner_slot = owner_slot;
        node.parent = FREE_NODE;
        node.left = FREE_NODE;
        node.right = FREE_NODE;
        node.color = 1; // Red

        // BST insert
        if self.root == FREE_NODE {
            self.root = index;
            self.nodes[index as usize].color = 0; // Root is black
        } else {
            let mut current = self.root;
            loop {
                let current_key = self.nodes[current as usize].key;
                if key < current_key {
                    if self.nodes[current as usize].left == FREE_NODE {
                        self.nodes[current as usize].left = index;
                        self.nodes[index as usize].parent = current;
                        break;
                    }
                    current = self.nodes[current as usize].left;
                } else {
                    if self.nodes[current as usize].right == FREE_NODE {
                        self.nodes[current as usize].right = index;
                        self.nodes[index as usize].parent = current;
                        break;
                    }
                    current = self.nodes[current as usize].right;
                }
            }
            self.fix_insert(index);
        }

        // Update best price
        self.update_best();
        self.order_count += 1;

        Some((index, key))
    }

    /// Red-black tree insert fixup
    fn fix_insert(&mut self, mut node: NodeHandle) {
        while node != self.root {
            let parent = self.nodes[node as usize].parent;
            if parent == FREE_NODE || self.nodes[parent as usize].color == 0 {
                break;
            }

            let grandparent = self.nodes[parent as usize].parent;
            if grandparent == FREE_NODE {
                break;
            }

            let uncle = if self.nodes[grandparent as usize].left == parent {
                self.nodes[grandparent as usize].right
            } else {
                self.nodes[grandparent as usize].left
            };

            if uncle != FREE_NODE && self.nodes[uncle as usize].color == 1 {
                // Uncle is red: recolor
                self.nodes[parent as usize].color = 0;
                self.nodes[uncle as usize].color = 0;
                self.nodes[grandparent as usize].color = 1;
                node = grandparent;
            } else {
                // Uncle is black: rotate
                if self.nodes[grandparent as usize].left == parent {
                    if self.nodes[parent as usize].right == node {
                        self.rotate_left(parent);
                        node = parent;
                    }
                    let p = self.nodes[node as usize].parent;
                    self.nodes[p as usize].color = 0;
                    self.nodes[grandparent as usize].color = 1;
                    self.rotate_right(grandparent);
                } else {
                    if self.nodes[parent as usize].left == node {
                        self.rotate_right(parent);
                        node = parent;
                    }
                    let p = self.nodes[node as usize].parent;
                    self.nodes[p as usize].color = 0;
                    self.nodes[grandparent as usize].color = 1;
                    self.rotate_left(grandparent);
                }
                break;
            }
        }
        self.nodes[self.root as usize].color = 0;
    }

    fn rotate_left(&mut self, node: NodeHandle) {
        let right = self.nodes[node as usize].right;
        if right == FREE_NODE {
            return;
        }

        self.nodes[node as usize].right = self.nodes[right as usize].left;
        if self.nodes[right as usize].left != FREE_NODE {
            self.nodes[self.nodes[right as usize].left as usize].parent = node;
        }

        self.nodes[right as usize].parent = self.nodes[node as usize].parent;
        if self.nodes[node as usize].parent == FREE_NODE {
            self.root = right;
        } else if self.nodes[self.nodes[node as usize].parent as usize].left == node {
            self.nodes[self.nodes[node as usize].parent as usize].left = right;
        } else {
            self.nodes[self.nodes[node as usize].parent as usize].right = right;
        }

        self.nodes[right as usize].left = node;
        self.nodes[node as usize].parent = right;
    }

    fn rotate_right(&mut self, node: NodeHandle) {
        let left = self.nodes[node as usize].left;
        if left == FREE_NODE {
            return;
        }

        self.nodes[node as usize].left = self.nodes[left as usize].right;
        if self.nodes[left as usize].right != FREE_NODE {
            self.nodes[self.nodes[left as usize].right as usize].parent = node;
        }

        self.nodes[left as usize].parent = self.nodes[node as usize].parent;
        if self.nodes[node as usize].parent == FREE_NODE {
            self.root = left;
        } else if self.nodes[self.nodes[node as usize].parent as usize].right == node {
            self.nodes[self.nodes[node as usize].parent as usize].right = left;
        } else {
            self.nodes[self.nodes[node as usize].parent as usize].left = left;
        }

        self.nodes[left as usize].right = node;
        self.nodes[node as usize].parent = left;
    }

    /// Remove an order by its key
    pub fn remove(&mut self, key: u128) -> Option<OrderNode> {
        let index = self.find_by_key(key)?;
        self.remove_at(index)
    }

    /// Remove an order at a specific index
    pub fn remove_at(&mut self, index: NodeHandle) -> Option<OrderNode> {
        if index as usize >= MAX_ORDERS {
            return None;
        }

        let node = self.nodes[index as usize];
        if node.is_free() {
            return None;
        }

        // Simple BST removal (not full RB-tree delete for simplicity)
        // In production, implement proper RB-tree deletion
        self.simple_remove(index);
        self.deallocate_node(index);
        self.order_count = self.order_count.saturating_sub(1);
        self.update_best();

        Some(node)
    }

    fn simple_remove(&mut self, index: NodeHandle) {
        let left = self.nodes[index as usize].left;
        let right = self.nodes[index as usize].right;
        let parent = self.nodes[index as usize].parent;

        let replacement = if left == FREE_NODE {
            right
        } else if right == FREE_NODE {
            left
        } else {
            // Find in-order successor
            let mut successor = right;
            while self.nodes[successor as usize].left != FREE_NODE {
                successor = self.nodes[successor as usize].left;
            }

            // Copy successor data to current node
            self.nodes[index as usize].key = self.nodes[successor as usize].key;
            self.nodes[index as usize].owner = self.nodes[successor as usize].owner;
            self.nodes[index as usize].quantity = self.nodes[successor as usize].quantity;
            self.nodes[index as usize].client_order_id =
                self.nodes[successor as usize].client_order_id;
            self.nodes[index as usize].timestamp = self.nodes[successor as usize].timestamp;
            self.nodes[index as usize].owner_slot = self.nodes[successor as usize].owner_slot;

            // Remove successor instead
            self.simple_remove(successor);
            return;
        };

        // Link parent to replacement
        if parent == FREE_NODE {
            self.root = replacement;
        } else if self.nodes[parent as usize].left == index {
            self.nodes[parent as usize].left = replacement;
        } else {
            self.nodes[parent as usize].right = replacement;
        }

        if replacement != FREE_NODE {
            self.nodes[replacement as usize].parent = parent;
        }
    }

    /// Find node by key
    fn find_by_key(&self, key: u128) -> Option<NodeHandle> {
        let mut current = self.root;
        while current != FREE_NODE {
            let current_key = self.nodes[current as usize].key;
            if key == current_key {
                return Some(current);
            } else if key < current_key {
                current = self.nodes[current as usize].left;
            } else {
                current = self.nodes[current as usize].right;
            }
        }
        None
    }

    /// Update the best price cache
    fn update_best(&mut self) {
        if self.root == FREE_NODE {
            self.best = FREE_NODE;
            return;
        }

        // For bids: best is maximum (rightmost)
        // For asks: best is minimum (leftmost)
        let mut current = self.root;
        if self.is_bids == 1 {
            while self.nodes[current as usize].right != FREE_NODE {
                current = self.nodes[current as usize].right;
            }
        } else {
            while self.nodes[current as usize].left != FREE_NODE {
                current = self.nodes[current as usize].left;
            }
        }
        self.best = current;
    }

    /// Get the best order (highest bid or lowest ask)
    pub fn get_best(&self) -> Option<&OrderNode> {
        if self.best == FREE_NODE {
            return None;
        }
        Some(&self.nodes[self.best as usize])
    }

    /// Get best price
    pub fn best_price(&self) -> Option<u64> {
        self.get_best().map(|n| n.price())
    }

    /// Update quantity of an order
    pub fn update_quantity(&mut self, index: NodeHandle, new_quantity: u64) {
        if (index as usize) < MAX_ORDERS {
            self.nodes[index as usize].quantity = new_quantity;
        }
    }

    /// Check if a price is acceptable for matching
    pub fn is_price_acceptable(&self, taker_price: u64, maker_price: u64) -> bool {
        if self.is_bids == 1 {
            // Matching against bids: taker is selling, bid price >= taker's ask
            maker_price >= taker_price
        } else {
            // Matching against asks: taker is buying, ask price <= taker's bid
            maker_price <= taker_price
        }
    }

    /// Iterate from best price
    pub fn iter_from_best(&self) -> BookSideIterator<'_> {
        BookSideIterator {
            book: self,
            current: self.best,
            done: false,
        }
    }
}

/// Iterator over BookSide from best price
pub struct BookSideIterator<'a> {
    book: &'a BookSide,
    current: NodeHandle,
    done: bool,
}

impl<'a> Iterator for BookSideIterator<'a> {
    type Item = (NodeHandle, &'a OrderNode);

    fn next(&mut self) -> Option<Self::Item> {
        if self.done || self.current == FREE_NODE {
            return None;
        }

        let index = self.current;
        let node = &self.book.nodes[index as usize];

        // Move to next node (in-order traversal for asks, reverse for bids)
        if self.book.is_bids == 1 {
            // For bids: go to predecessor
            self.current = self.predecessor(index);
        } else {
            // For asks: go to successor
            self.current = self.successor(index);
        }

        Some((index, node))
    }
}

impl<'a> BookSideIterator<'a> {
    fn successor(&self, node: NodeHandle) -> NodeHandle {
        let mut current = node;

        // If right child exists, go right then all the way left
        if self.book.nodes[current as usize].right != FREE_NODE {
            current = self.book.nodes[current as usize].right;
            while self.book.nodes[current as usize].left != FREE_NODE {
                current = self.book.nodes[current as usize].left;
            }
            return current;
        }

        // Otherwise, go up until we're a left child
        let mut parent = self.book.nodes[current as usize].parent;
        while parent != FREE_NODE && current == self.book.nodes[parent as usize].right {
            current = parent;
            parent = self.book.nodes[current as usize].parent;
        }

        parent
    }

    fn predecessor(&self, node: NodeHandle) -> NodeHandle {
        let mut current = node;

        // If left child exists, go left then all the way right
        if self.book.nodes[current as usize].left != FREE_NODE {
            current = self.book.nodes[current as usize].left;
            while self.book.nodes[current as usize].right != FREE_NODE {
                current = self.book.nodes[current as usize].right;
            }
            return current;
        }

        // Otherwise, go up until we're a right child
        let mut parent = self.book.nodes[current as usize].parent;
        while parent != FREE_NODE && current == self.book.nodes[parent as usize].left {
            current = parent;
            parent = self.book.nodes[current as usize].parent;
        }

        parent
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bookside_insert_and_best() {
        let mut book = BookSide::default();
        book.initialize(false); // asks

        let owner = Pubkey::new_unique();

        // Insert asks at different prices
        book.insert(5000, 100, owner, 1, 0, 0); // 50%
        book.insert(4000, 100, owner, 2, 0, 1); // 40%
        book.insert(6000, 100, owner, 3, 0, 2); // 60%

        // Best ask should be lowest: 4000
        assert_eq!(book.best_price(), Some(4000));
        assert_eq!(book.order_count, 3);
    }

    #[test]
    fn test_bookside_bids_best() {
        let mut book = BookSide::default();
        book.initialize(true); // bids

        let owner = Pubkey::new_unique();

        // Insert bids at different prices
        book.insert(5000, 100, owner, 1, 0, 0);
        book.insert(4000, 100, owner, 2, 0, 1);
        book.insert(6000, 100, owner, 3, 0, 2);

        // Best bid should be highest: 6000
        assert_eq!(book.best_price(), Some(6000));
    }

    #[test]
    fn test_bookside_remove() {
        let mut book = BookSide::default();
        book.initialize(false);

        let owner = Pubkey::new_unique();

        let (_, key1) = book.insert(5000, 100, owner, 1, 0, 0).unwrap();
        book.insert(4000, 100, owner, 2, 0, 1);

        assert_eq!(book.order_count, 2);

        book.remove(key1);
        assert_eq!(book.order_count, 1);
        assert_eq!(book.best_price(), Some(4000));
    }

    #[test]
    fn test_price_acceptable() {
        let mut bids = BookSide::default();
        bids.initialize(true);

        let mut asks = BookSide::default();
        asks.initialize(false);

        // Bid at 5000, taker selling at 4500 -> acceptable (bid >= ask)
        assert!(bids.is_price_acceptable(4500, 5000));
        // Bid at 5000, taker selling at 5500 -> not acceptable
        assert!(!bids.is_price_acceptable(5500, 5000));

        // Ask at 5000, taker buying at 5500 -> acceptable (ask <= bid)
        assert!(asks.is_price_acceptable(5500, 5000));
        // Ask at 5000, taker buying at 4500 -> not acceptable
        assert!(!asks.is_price_acceptable(4500, 5000));
    }
}
