import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function ResetPassword() {
    const router = useRouter();
    const { token } = router.query;

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setMessage("Passwords do not match.");
            return;
        }

        const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
        });

        const data = await res.json();
        setMessage(data.message);

        if (res.ok) {
            setTimeout(() => {
                router.push("/auth/signin");
            }, 3000);
        }
    };

    return (
        <>
            <Head>
                <title>Reset Password | Kamiyo.ai</title>
            </Head>
            <div className="flex items-center justify-center bg-black text-white h-[calc(100vh-140px)]">
                <div className="flex flex-col items-center w-full max-w-sm px-6 py-10">
                    <h1 className="text-3xl mb-6 text-center pb-8">Reset Password</h1>

                    {message && <p className="text-green-400 text-center">{message}</p>}

                    <form onSubmit={handleSubmit} className="w-full">
                        <div className="w-full mb-4">
                            <label className="block text-gray-400 text-xs mb-1">New Password</label>
                            <input
                                type="password"
                                className="w-full bg-transparent border-b border-gray-500 text-white py-2 focus:outline-none"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="w-full mb-4">
                            <label className="block text-gray-400 text-xs mb-1">Confirm Password</label>
                            <input
                                type="password"
                                className="w-full bg-transparent border-b border-gray-500 text-white py-2 focus:outline-none"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button className="w-full bg-magenta text-white py-3 rounded-full text-l">
                            Reset Password
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
