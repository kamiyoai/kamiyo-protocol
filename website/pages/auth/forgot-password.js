import { useState } from "react";
import Head from "next/head";
import Link from "next/link";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const data = await res.json();
        setMessage(data.message);
    };

    return (
        <>
            <Head>
                <title>Forgot Password | KAMIYO</title>
            </Head>
            <div className="flex items-center justify-center bg-black text-white h-[calc(100vh-140px)]">
                <div className="flex flex-col items-center w-full max-w-sm px-6 py-10">
                    <h1 className="text-3xl mb-6 text-center pb-8">Forgot password</h1>

                    {message && <p className="text-green-400 text-center">{message}</p>}

                    <form onSubmit={handleSubmit} className="w-full">
                        <div className="w-full mb-4">
                            <label className="block text-gray-400 text-xs mb-1">Email</label>
                            <input
                                type="email"
                                className="w-full bg-transparent border-b border-gray-500 text-white py-2 focus:outline-none"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <button className="w-full bg-magenta text-white py-3 rounded-full text-l">
                            Send reset link
                        </button>
                    </form>

                    <div className="mt-6 text-gray-400 text-sm">
                        <Link href="/auth/signin" className="text-magenta">
                            Back to Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
