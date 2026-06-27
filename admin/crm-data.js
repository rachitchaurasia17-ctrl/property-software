// Realistic Tricity demo data
window.CRM_DEMO = {
  staff: [
    { id: 's1', name: 'Amit', role: 'team' },
    { id: 's2', name: 'Sonia', role: 'team' },
    { id: 's3', name: 'Raj', role: 'team' },
    { id: 's4', name: 'Vikram', role: 'dealer' }
  ],
  areas: ['Aerocity', 'IT City', 'New Chandigarh', 'Mullanpur', 'Zirakpur', 'Derabassi', 'Airport Road'],
  clients: [
    { id: 'c1', name: 'Rahul Sharma', phone: '9876543210', type: 'buyer', interestedArea: 'Aerocity', sector: 'Block C', propertyType: 'Residential Plot', sizeRequirement: '500 sq yd', budgetRange: '₹3-4 Cr', timeline: 'Immediate', leadSource: 'Reference', assignedStaff: 's1', status: 'Warm', notes: 'Looking for a park facing plot.', lastActivityAt: Date.now() - 86400000, demo: true },
    { id: 'c2', name: 'Sonia Mehta', phone: '9876543211', type: 'investor', interestedArea: 'IT City', sector: '', propertyType: 'Commercial SCO', sizeRequirement: '', budgetRange: '₹5-7 Cr', timeline: '1-3 months', leadSource: 'Website', assignedStaff: 's2', status: 'Property Shared', notes: 'Wants high rental yield.', lastActivityAt: Date.now() - 172800000, demo: true },
    { id: 'c3', name: 'Vikram Kapoor', phone: '9876543212', type: 'buyer', interestedArea: 'New Chandigarh', sector: '', propertyType: 'Residential Plot', sizeRequirement: '250 sq yd', budgetRange: '₹1-1.5 Cr', timeline: 'Flexible', leadSource: 'Walk-in', assignedStaff: 's3', status: 'Site Visit Planned', notes: 'Visiting this weekend.', lastActivityAt: Date.now() - 3600000, demo: true },
    { id: 'c4', name: 'Priya Jain', phone: '9876543213', type: 'seller', interestedArea: 'Zirakpur', sector: 'VIP Road', propertyType: 'Showroom', sizeRequirement: '', budgetRange: '', timeline: 'Immediate', leadSource: 'Reference', assignedStaff: 's1', status: 'Negotiation', notes: 'Wants quick exit.', lastActivityAt: Date.now() - 7200000, demo: true },
    { id: 'c5', name: 'Rajat Verma', phone: '9876543214', type: 'buyer', interestedArea: 'Derabassi', sector: '', propertyType: 'Commercial Belt', sizeRequirement: '', budgetRange: '₹2-3 Cr', timeline: 'Flexible', leadSource: 'Campaign', assignedStaff: 's2', status: 'Closed', notes: 'Deal closed last week.', lastActivityAt: Date.now() - 604800000, demo: true },
    { id: 'c6', name: 'Anuj Bansal', phone: '9876543215', type: 'investor', interestedArea: 'Aerocity', sector: 'Block A', propertyType: 'Residential Plot', sizeRequirement: '1000 sq yd', budgetRange: '₹7-8 Cr', timeline: 'Immediate', leadSource: 'Reference', assignedStaff: 's4', status: 'Not Answering', notes: 'Tried calling 3 times.', lastActivityAt: Date.now() - 864000000, demo: true },
    { id: 'c7', name: 'Neha Gupta', phone: '9876543216', type: 'buyer', interestedArea: 'Mullanpur', sector: '', propertyType: 'Residential Plot', sizeRequirement: '300 sq yd', budgetRange: '₹1.5-2 Cr', timeline: '1-3 months', leadSource: 'Website', assignedStaff: 's3', status: 'New', notes: 'Fresh lead from FB.', lastActivityAt: Date.now(), demo: true },
    { id: 'c8', name: 'Karan Singh', phone: '9876543217', type: 'investor', interestedArea: 'Airport Road', sector: '', propertyType: 'Commercial', sizeRequirement: '200 sq yd', budgetRange: '₹10-12 Cr', timeline: 'Immediate', leadSource: 'Reference', assignedStaff: 's1', status: 'Warm', notes: 'High net worth individual.', lastActivityAt: Date.now() - 3600000, demo: true },
    { id: 'c9', name: 'Aman Gill', phone: '9876543218', type: 'buyer', interestedArea: 'Zirakpur', sector: 'VIP Road', propertyType: 'Showroom', sizeRequirement: '100 sq yd', budgetRange: '₹1-1.5 Cr', timeline: 'Flexible', leadSource: 'Walk-in', assignedStaff: 's2', status: 'Site Visit Done', notes: 'Liked the location. Awaiting confirmation.', lastActivityAt: Date.now() - 86400000*2, demo: true }
  ],
  properties: [
    { id: 'p1', title: 'Aerocity Block C 500 sq yd', area: 'Aerocity', sector: 'Block C', plotNumber: 'C-102', type: 'Residential Plot', size: '500 sq yd', facing: 'East', roadWidth: '60 ft', tags: 'Park Facing, Premium', description: 'Excellent plot near the main entrance.', ownerContact: '9998887776', internalStatus: 'Available', mapPinStatus: 'Pinned', sectorMapLink: '', originalMapLink: '', notes: 'Owner is motivated.', demo: true },
    { id: 'p2', title: 'IT City Commercial SCO', area: 'IT City', sector: 'Block F', plotNumber: 'SCO-45', type: 'Commercial', size: '120 sq yd', facing: 'North', roadWidth: '80 ft', tags: 'Main Road', description: 'Prime commercial plot.', ownerContact: '9998887775', internalStatus: 'Available', mapPinStatus: 'Unpinned', sectorMapLink: '', originalMapLink: '', notes: '', demo: true },
    { id: 'p3', title: 'New Chandigarh 250 sq yd', area: 'New Chandigarh', sector: 'Sector 20', plotNumber: '20-14', type: 'Residential Plot', size: '250 sq yd', facing: 'West', roadWidth: '40 ft', tags: '', description: 'Good for investment.', ownerContact: '9998887774', internalStatus: 'Hold', mapPinStatus: 'Pinned', sectorMapLink: '', originalMapLink: '', notes: 'Token received.', demo: true },
    { id: 'p4', title: 'Mullanpur 500 sq yd plot', area: 'Mullanpur', sector: 'Eco City 1', plotNumber: 'E-50', type: 'Residential Plot', size: '500 sq yd', facing: 'South', roadWidth: '80 ft', tags: 'Corner', description: 'Premium corner plot.', ownerContact: '9998887773', internalStatus: 'Available', mapPinStatus: 'Unpinned', sectorMapLink: '', originalMapLink: '', notes: '', demo: true },
    { id: 'p5', title: 'Zirakpur showroom VIP Road', area: 'Zirakpur', sector: 'VIP Road', plotNumber: 'S-12', type: 'Commercial', size: '150 sq yd', facing: 'East', roadWidth: '100 ft', tags: 'High Footfall', description: 'Ready to move showroom.', ownerContact: '9998887772', internalStatus: 'Available', mapPinStatus: 'Pinned', sectorMapLink: '', originalMapLink: '', notes: '', demo: true },
    { id: 'p6', title: 'Derabassi commercial belt', area: 'Derabassi', sector: 'Highway', plotNumber: 'C-8', type: 'Commercial', size: '1000 sq yd', facing: 'North', roadWidth: '150 ft', tags: 'Highway Facing', description: 'Large commercial patch.', ownerContact: '9998887771', internalStatus: 'Sold', mapPinStatus: 'Unpinned', sectorMapLink: '', originalMapLink: '', notes: 'Sold to Rajat.', demo: true }
  ],
  followups: [
    { id: 'f1', clientId: 'c1', assignedStaffId: 's1', dateTime: new Date(Date.now() + 86400000).toISOString(), type: 'Call', status: 'pending', notes: 'Discuss pricing.', demo: true },
    { id: 'f2', clientId: 'c2', assignedStaffId: 's2', dateTime: new Date(Date.now() - 3600000).toISOString(), type: 'WhatsApp', status: 'missed', notes: 'Share more options.', demo: true },
    { id: 'f3', clientId: 'c4', assignedStaffId: 's1', dateTime: new Date(Date.now() - 86400000).toISOString(), type: 'Negotiation', status: 'done', notes: 'Finalized token amount.', demo: true },
    { id: 'f4', clientId: 'c8', assignedStaffId: 's1', dateTime: new Date(Date.now() - 86400000 * 3).toISOString(), type: 'Call', status: 'missed', notes: 'Ask about Airport road plot.', demo: true }
  ],
  siteVisits: [
    { id: 'sv1', clientId: 'c3', propertyId: 'p3', area: 'New Chandigarh', assignedStaffId: 's3', dateTime: new Date(Date.now() + 172800000).toISOString(), status: 'scheduled', result: '', notes: 'Client coming with family.', demo: true },
    { id: 'sv2', clientId: 'c1', propertyId: 'p1', area: 'Aerocity', assignedStaffId: 's1', dateTime: new Date(Date.now() - 172800000).toISOString(), status: 'completed', result: 'Liked', notes: 'Very positive response.', demo: true },
    { id: 'sv3', clientId: 'c9', propertyId: 'p5', area: 'Zirakpur', assignedStaffId: 's2', dateTime: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed', result: 'Liked', notes: 'Needs some discount.', demo: true }
  ],
  deals: [
    { id: 'd1', clientId: 'c5', propertyId: 'p6', area: 'Derabassi', dealType: 'sale', dealDate: new Date(Date.now() - 604800000).toISOString(), dealValue: 25000000, commissionType: 'percentage', commissionAmount: 250000, commissionReceived: 100000, commissionPending: 150000, staffId: 's2', status: 'Closed', notes: 'Part payment received.', demo: true },
    { id: 'd2', clientId: 'c1', propertyId: 'p1', area: 'Aerocity', dealType: 'sale', dealDate: new Date(Date.now() - 86400000 * 15).toISOString(), dealValue: 35000000, commissionType: 'percentage', commissionAmount: 350000, commissionReceived: 350000, commissionPending: 0, staffId: 's1', status: 'Closed', notes: 'Full payment cleared.', demo: true },
    { id: 'd3', clientId: 'c1', propertyId: 'p2', area: 'IT City', dealType: 'sale', dealDate: new Date(Date.now() - 86400000 * 5).toISOString(), dealValue: 60000000, commissionType: 'fixed', commissionAmount: 500000, commissionReceived: 200000, commissionPending: 300000, staffId: 's1', status: 'Closed', notes: 'Repeat client.', demo: true }
  ],
  events: [
    { id: 'e1', type: 'map_opened', timestamp: Date.now() - 3600000, staffId: 's1', area: 'Aerocity', metadata: { mapType: 'original' }, demo: true },
    { id: 'e2', type: 'property_shared_whatsapp', timestamp: Date.now() - 7200000, staffId: 's2', clientId: 'c2', propertyId: 'p2', metadata: {}, demo: true },
    { id: 'e3', type: 'client_added', timestamp: Date.now() - 86400000, staffId: 's3', clientId: 'c7', metadata: {}, demo: true },
    { id: 'e4', type: 'site_visit_completed', timestamp: Date.now() - 172800000, staffId: 's1', clientId: 'c1', area: 'Aerocity', metadata: {}, demo: true },
    { id: 'e5', type: 'map_opened', timestamp: Date.now() - 14400000, staffId: 's2', area: 'IT City', metadata: { mapType: 'original' }, demo: true },
    { id: 'e6', type: 'property_viewed', timestamp: Date.now() - 18000000, staffId: 's1', clientId: 'c1', area: 'Aerocity', propertyId: 'p1', metadata: {}, demo: true },
    { id: 'e7', type: 'property_viewed', timestamp: Date.now() - 20000000, staffId: 's2', clientId: 'c2', area: 'IT City', propertyId: 'p2', metadata: {}, demo: true }
  ],
  pins: [
    { id: 'pin1', title: 'Demo Pin 1', type: 'available-property', area: 'Aerocity', x: 50, y: 50, description: '500 sq yd plot', linkedProperty: 'p1', visibility: 'public', notes: '', demo: true }
  ],
  mapDrawings: [
    { id: 'md1', kind: 'sectorTag', title: 'Block A Master', city: 'Aerocity', mapType: 'original', mapId: 'tricity-aerotropolis', points: [{x:30,y:30},{x:40,y:30},{x:40,y:40},{x:30,y:40}], visibility: 'public', status: 'Published', group: 'A', linkedSectorMapId: '', demo: true },
    { id: 'md2', kind: 'sectorTag', title: 'Block B Master', city: 'Aerocity', mapType: 'original', mapId: 'tricity-aerotropolis', points: [{x:45,y:30},{x:55,y:30},{x:55,y:40},{x:45,y:40}], visibility: 'public', status: 'Published', group: 'B', linkedSectorMapId: '', demo: true },
    { id: 'md3', kind: 'road', title: 'Airport Link Road', city: 'Aerocity', mapType: 'original', mapId: 'tricity-aerotropolis', points: [{x:20,y:80},{x:80,y:80}], visibility: 'public', status: 'Published', type: 'expressway', demo: true },
    { id: 'md4', kind: 'block', title: 'Premium Pocket', city: 'Aerocity', mapType: 'original', mapId: 'tricity-aerotropolis', points: [{x:60,y:60},{x:70,y:60},{x:70,y:70},{x:60,y:70}], visibility: 'public', status: 'Published', demo: true }
  ]
};
