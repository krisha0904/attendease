import 'package:flutter/material.dart';

class HodDashboardScreen extends StatelessWidget {
  const HodDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text("Department Dashboard", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Today — 11 August 2024", style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 20),
            
            // Stats Row
            Row(
              children: [
                _buildStatCard("Present", "18", Colors.green),
                const SizedBox(width: 10),
                _buildStatCard("On Break", "2", Colors.orange),
                const SizedBox(width: 10),
                _buildStatCard("Absent", "3", Colors.red),
              ],
            ),
            
            const SizedBox(height: 30),
            const Text("Faculty & Staff Status", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 15),
            
            // Faculty List
            _buildFacultyList(),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(15),
          border: Border(left: BorderSide(color: color, width: 5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildFacultyList() {
    final faculties = [
      {"name": "Dr. Patel", "status": "WORKING", "time": "09:02 AM", "color": Colors.green},
      {"name": "Prof. Shah", "status": "WORKING", "time": "08:55 AM", "color": Colors.green},
      {"name": "Prof. Mehta", "status": "ON BREAK", "time": "01:05 PM", "color": Colors.orange},
      {"name": "Prof. Kumar", "status": "ABSENT", "time": "--:--", "color": Colors.red},
      {"name": "Dr. Joshi", "status": "WORKING", "time": "09:15 AM", "color": Colors.green},
    ];

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: faculties.length,
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final faculty = faculties[index];
        return Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(faculty["name"] as String, style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text("In: ${faculty["time"]}", style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: (faculty["color"] as Color).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  faculty["status"] as String,
                  style: TextStyle(color: faculty["color"] as Color, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              )
            ],
          ),
        );
      },
    );
  }
}
