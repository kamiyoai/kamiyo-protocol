export default async function handler(req, res) {
    const response = await fetch("http://localhost:8000/run-swarm?use_pfn_hardware=true");
    const data = await response.json();
    res.status(200).json(data);
}
